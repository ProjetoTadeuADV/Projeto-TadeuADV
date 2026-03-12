import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { AccountProfile } from "../types";

const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const AVATAR_VIEWPORT_SIZE = 320;
const AVATAR_OUTPUT_SIZE = 512;
const AUTH_ONLY_PROFILE_STORAGE_KEY = "lf_profile_auth_only";

interface AccountProfileResponse {
  user: AccountProfile;
}

interface AccountProfilePatchPayload {
  name?: string | null;
  avatarUrl?: string | null;
}

interface ProfileSnapshot {
  name: string | null;
  avatarUrl: string | null;
}

interface ProfileToast {
  type: "success" | "error";
  message: string;
}

interface CropOffset {
  x: number;
  y: number;
}

interface AvatarCropModalProps {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onApply: (avatarUrl: string) => void;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProfileSnapshot(nameInput: string, avatarUrl: string | null): ProfileSnapshot {
  return {
    name: normalizeOptionalText(nameInput),
    avatarUrl: normalizeOptionalText(avatarUrl)
  };
}

function snapshotsMatch(a: ProfileSnapshot, b: ProfileSnapshot): boolean {
  return a.name === b.name && a.avatarUrl === b.avatarUrl;
}

function computeInitials(name: string | null | undefined, email: string | null | undefined): string {
  const base = (name || email || "Perfil").trim();
  const parts = base.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "P";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l4.2 4.2-1.4 1.4-1.8-1.8V15h-2V6.8L9.2 8.6 7.8 7.2 12 3zm-7 14h14v4H5v-4z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9zm1 12h8a2 2 0 002-2V9H6v10a2 2 0 002 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function toAuthOnlyStorageValue(profile: AccountProfile): string {
  return JSON.stringify({
    name: profile.name,
    avatarUrl: profile.avatarUrl
  });
}

function readAuthOnlyStorageFallback(): { name: string | null; avatarUrl: string | null } {
  if (typeof window === "undefined") {
    return { name: null, avatarUrl: null };
  }

  const raw = window.localStorage.getItem(AUTH_ONLY_PROFILE_STORAGE_KEY);
  if (!raw) {
    return { name: null, avatarUrl: null };
  }

  try {
    const parsed = JSON.parse(raw) as { name?: unknown; avatarUrl?: unknown };
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null
    };
  } catch {
    return { name: null, avatarUrl: null };
  }
}

function persistAuthOnlyStorage(profile: AccountProfile): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_ONLY_PROFILE_STORAGE_KEY, toAuthOnlyStorageValue(profile));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function AvatarCropModal({ open, imageSrc, onCancel, onApply }: AvatarCropModalProps) {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open || !imageSrc) {
      setSourceImage(null);
      setError(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const image = new Image();
    image.onload = () => {
      if (!active) {
        return;
      }

      setSourceImage(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setLoading(false);
    };
    image.onerror = () => {
      if (!active) {
        return;
      }

      setError("Não foi possível carregar a imagem selecionada.");
      setSourceImage(null);
      setLoading(false);
    };
    image.src = imageSrc;

    return () => {
      active = false;
    };
  }, [imageSrc, open]);

  const baseScale = useMemo(() => {
    if (!sourceImage) {
      return 1;
    }

    return Math.max(
      AVATAR_VIEWPORT_SIZE / sourceImage.naturalWidth,
      AVATAR_VIEWPORT_SIZE / sourceImage.naturalHeight
    );
  }, [sourceImage]);

  const baseWidth = sourceImage ? sourceImage.naturalWidth * baseScale : AVATAR_VIEWPORT_SIZE;
  const baseHeight = sourceImage ? sourceImage.naturalHeight * baseScale : AVATAR_VIEWPORT_SIZE;
  const displayedWidth = baseWidth * zoom;
  const displayedHeight = baseHeight * zoom;
  const imageLeft = (AVATAR_VIEWPORT_SIZE - displayedWidth) / 2 + offset.x;
  const imageTop = (AVATAR_VIEWPORT_SIZE - displayedHeight) / 2 + offset.y;

  const clampOffset = useCallback(
    (nextOffset: CropOffset, nextZoom = zoom): CropOffset => {
      const displayedWidth = baseWidth * nextZoom;
      const displayedHeight = baseHeight * nextZoom;
      const maxX = Math.max((displayedWidth - AVATAR_VIEWPORT_SIZE) / 2, 0);
      const maxY = Math.max((displayedHeight - AVATAR_VIEWPORT_SIZE) / 2, 0);

      return {
        x: clampValue(nextOffset.x, -maxX, maxX),
        y: clampValue(nextOffset.y, -maxY, maxY)
      };
    },
    [baseHeight, baseWidth, zoom]
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();

      setZoom((current) => {
        const delta = event.deltaY < 0 ? 0.08 : -0.08;
        const nextZoom = clampValue(current + delta, 1, 4);
        setOffset((currentOffset) => clampOffset(currentOffset, nextZoom));
        return nextZoom;
      });
    },
    [clampOffset]
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }

      const diffX = event.clientX - dragRef.current.x;
      const diffY = event.clientY - dragRef.current.y;
      dragRef.current = {
        ...dragRef.current,
        x: event.clientX,
        y: event.clientY
      };

      setOffset((currentOffset) =>
        clampOffset({
          x: currentOffset.x + diffX,
          y: currentOffset.y + diffY
        })
      );
    },
    [clampOffset]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleApply = useCallback(() => {
    if (!sourceImage) {
      return;
    }

    setApplying(true);
    try {
      const displayedScale = baseScale * zoom;
      const cropSizeInSource = AVATAR_VIEWPORT_SIZE / displayedScale;
      const topLeftX = (AVATAR_VIEWPORT_SIZE - displayedWidth) / 2 + offset.x;
      const topLeftY = (AVATAR_VIEWPORT_SIZE - displayedHeight) / 2 + offset.y;
      const rawSrcX = -topLeftX / displayedScale;
      const rawSrcY = -topLeftY / displayedScale;
      const maxSrcX = Math.max(sourceImage.naturalWidth - cropSizeInSource, 0);
      const maxSrcY = Math.max(sourceImage.naturalHeight - cropSizeInSource, 0);
      const srcX = clampValue(rawSrcX, 0, maxSrcX);
      const srcY = clampValue(rawSrcY, 0, maxSrcY);

      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Não foi possível gerar o recorte desta imagem.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
      context.drawImage(
        sourceImage,
        srcX,
        srcY,
        cropSizeInSource,
        cropSizeInSource,
        0,
        0,
        AVATAR_OUTPUT_SIZE,
        AVATAR_OUTPUT_SIZE
      );

      onApply(canvas.toDataURL("image/jpeg", 0.9));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao aplicar recorte.");
    } finally {
      setApplying(false);
    }
  }, [baseScale, displayedHeight, displayedWidth, offset.x, offset.y, onApply, sourceImage, zoom]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="modal-card profile-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Recortar foto de perfil"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>Ajustar foto de perfil</h2>
            <p>Arraste para enquadrar e use o scroll do mouse para aproximar.</p>
          </div>
        </header>

        <div className="avatar-crop-shell">
          <div
            className="avatar-crop-viewport"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {sourceImage && (
              <img
                src={imageSrc ?? undefined}
                alt="Pré-visualização da foto"
                className="avatar-crop-image"
                draggable={false}
                style={{
                  width: `${displayedWidth}px`,
                  height: `${displayedHeight}px`,
                  left: `${imageLeft}px`,
                  top: `${imageTop}px`
                }}
              />
            )}

            {!sourceImage && !loading && <p className="avatar-crop-empty">Selecione uma foto para recortar.</p>}
            {loading && <p className="avatar-crop-empty">Carregando imagem...</p>}

            <div className="avatar-crop-grid" aria-hidden="true">
              <span className="avatar-crop-grid-line avatar-crop-grid-line--v1" />
              <span className="avatar-crop-grid-line avatar-crop-grid-line--v2" />
              <span className="avatar-crop-grid-line avatar-crop-grid-line--h1" />
              <span className="avatar-crop-grid-line avatar-crop-grid-line--h2" />
            </div>
          </div>
        </div>

        <label className="avatar-zoom-label">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(event) => {
              const nextZoom = clampValue(Number(event.target.value), 1, 4);
              setZoom(nextZoom);
              setOffset((currentOffset) => clampOffset(currentOffset, nextZoom));
            }}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="profile-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={applying}>
            Cancelar
          </button>
          <button type="button" onClick={handleApply} disabled={!sourceImage || applying}>
            {applying ? "Aplicando..." : "Aplicar foto"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProfileSettingsPage() {
  const { user, accessProfile, getToken, refreshAccessProfile, logout, deleteCurrentAccount } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ProfileToast | null>(null);

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<ProfileSnapshot>({ name: null, avatarUrl: null });

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const currentSnapshot = useMemo(() => buildProfileSnapshot(nameInput, avatarUrl), [avatarUrl, nameInput]);
  const hasChanges = !snapshotsMatch(initialSnapshot, currentSnapshot);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const response = await apiRequest<AccountProfileResponse>("/v1/users/me", { token });
        if (!mounted) {
          return;
        }

        setProfile(response.user);
        setNameInput(response.user.name ?? "");
        setAvatarUrl(response.user.avatarUrl ?? null);
        setInitialSnapshot(buildProfileSnapshot(response.user.name ?? "", response.user.avatarUrl ?? null));
      } catch (nextError) {
        if (!mounted) {
          return;
        }

        if (nextError instanceof ApiError && nextError.statusCode === 404) {
          const fallback = readAuthOnlyStorageFallback();
          const fallbackProfile: AccountProfile = {
            id: user?.uid ?? "",
            firebaseUid: user?.uid ?? "",
            email: user?.email ?? null,
            name: fallback.name ?? accessProfile?.name ?? user?.displayName ?? null,
            avatarUrl: fallback.avatarUrl ?? accessProfile?.avatarUrl ?? null
          };
          setProfile(fallbackProfile);
          setNameInput(fallbackProfile.name ?? "");
          setAvatarUrl(fallbackProfile.avatarUrl ?? null);
          setInitialSnapshot(buildProfileSnapshot(fallbackProfile.name ?? "", fallbackProfile.avatarUrl ?? null));
          setToast({
            type: "success",
            message: "Modo local ativo: perfil carregado do armazenamento local."
          });
          return;
        }

        const message =
          nextError instanceof ApiError
            ? nextError.message
            : "Não foi possível carregar as configurações da conta.";
        setError(message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [accessProfile?.avatarUrl, accessProfile?.name, getToken, user?.displayName, user?.email, user?.uid]);

  const handleChoosePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setToast({
        type: "error",
        message: "Selecione apenas arquivos de imagem."
      });
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setToast({
        type: "error",
        message: "A foto deve ter no máximo 5MB."
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setToast({
          type: "error",
          message: "Não foi possível processar o arquivo selecionado."
        });
        return;
      }

      setCropImageSrc(reader.result);
      setCropOpen(true);
    };
    reader.onerror = () => {
      setToast({
        type: "error",
        message: "Falha ao carregar a imagem selecionada."
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const applyProfilePatch = useCallback(
    async (payload: AccountProfilePatchPayload, successMessage: string): Promise<boolean> => {
      if (
        !Object.prototype.hasOwnProperty.call(payload, "name") &&
        !Object.prototype.hasOwnProperty.call(payload, "avatarUrl")
      ) {
        return true;
      }

      setSaving(true);
      setError(null);

      const updatesName = Object.prototype.hasOwnProperty.call(payload, "name");
      const updatesAvatar = Object.prototype.hasOwnProperty.call(payload, "avatarUrl");

      try {
        const token = await getToken();
        const response = await apiRequest<AccountProfileResponse>("/v1/users/me", {
          method: "PATCH",
          token,
          body: payload
        });

        setProfile(response.user);
        persistAuthOnlyStorage(response.user);
        await refreshAccessProfile();

        setInitialSnapshot((current) => ({
          name: updatesName ? normalizeOptionalText(response.user.name) : current.name,
          avatarUrl: updatesAvatar ? normalizeOptionalText(response.user.avatarUrl) : current.avatarUrl
        }));

        if (updatesName) {
          setNameInput(response.user.name ?? "");
        }

        if (updatesAvatar) {
          setAvatarUrl(response.user.avatarUrl ?? null);
        }

        setToast({
          type: "success",
          message: successMessage
        });

        return true;
      } catch (nextError) {
        const message =
          nextError instanceof ApiError ? nextError.message : "Não foi possível salvar o perfil agora.";
        setError(message);
        setToast({
          type: "error",
          message
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [getToken, refreshAccessProfile]
  );

  const handleApplyCroppedAvatar = useCallback(
    (nextAvatarUrl: string) => {
      setAvatarUrl(nextAvatarUrl);
      setCropOpen(false);
      setCropImageSrc(null);
      void applyProfilePatch(
        {
          avatarUrl: normalizeOptionalText(nextAvatarUrl)
        },
        "Foto de perfil salva com sucesso."
      );
    },
    [applyProfilePatch]
  );

  const handleRemoveAvatar = useCallback(() => {
    if (!avatarUrl) {
      return;
    }

    setAvatarUrl(null);
    void applyProfilePatch(
      {
        avatarUrl: null
      },
      "Foto de perfil removida."
    );
  }, [applyProfilePatch, avatarUrl]);

  const handleCloseCrop = useCallback(() => {
    setCropOpen(false);
    setCropImageSrc(null);
  }, []);

  async function handleSaveProfile() {
    setError(null);

    const normalizedName = normalizeOptionalText(nameInput);
    const normalizedAvatarUrl = normalizeOptionalText(avatarUrl);
    const payload: AccountProfilePatchPayload = {};

    if (normalizedName !== initialSnapshot.name) {
      payload.name = normalizedName;
    }

    if (normalizedAvatarUrl !== initialSnapshot.avatarUrl) {
      payload.avatarUrl = normalizedAvatarUrl;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, "name") && !Object.prototype.hasOwnProperty.call(payload, "avatarUrl")) {
      return;
    }

    await applyProfilePatch(payload, "Perfil atualizado com sucesso.");
  }

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setLogoutLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleting) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja excluir sua conta agora? Esta ação remove seu cadastro e os casos vinculados."
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteCurrentAccount();
      navigate("/", { replace: true });
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.message
          : "Não foi possível excluir sua conta agora. Tente novamente.";
      setError(message);
      setToast({
        type: "error",
        message
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Configurações da conta</p>
            <h1>Perfil</h1>
            <p>Atualize seu nome de exibição, foto de perfil e gerencie as ações da sua conta.</p>
          </div>
        </div>
      </section>

      <section className="workspace-panel profile-settings-panel">
        <header className="page-header">
          <div>
            <h2>Dados do perfil</h2>
            <p>As alterações salvas aqui aparecem no topo da área logada.</p>
          </div>
        </header>

        {loading && <p>Carregando perfil...</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && profile && (
          <div className="profile-settings-grid">
            <aside className="profile-avatar-panel">
              <div className="profile-avatar-preview" aria-label="Pré-visualização da foto de perfil">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Foto de perfil" />
                ) : (
                  <span>{computeInitials(nameInput, profile.email)}</span>
                )}
                <div className="profile-avatar-overlay">
                  <button
                    type="button"
                    className="profile-avatar-icon-button"
                    onClick={handleChoosePhoto}
                    disabled={saving}
                    aria-label="Escolher foto"
                    title="Escolher foto"
                  >
                    <UploadIcon />
                  </button>
                  <button
                    type="button"
                    className="profile-avatar-icon-button profile-avatar-icon-button--danger"
                    onClick={handleRemoveAvatar}
                    disabled={!avatarUrl || saving}
                    aria-label="Remover foto"
                    title="Remover foto"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              <small>Formatos aceitos: image/* até 5MB.</small>
              {saving && <small>Salvando alterações...</small>}
            </aside>

            <div className="profile-form-grid">
              <label>
                Nome
                <input
                  type="text"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Seu nome de exibição"
                  maxLength={120}
                />
              </label>

              <label>
                E-mail
                <input type="text" value={profile.email ?? ""} readOnly />
              </label>

              <label>
                UID do provedor
                <input type="text" value={profile.firebaseUid} readOnly />
              </label>

              <div className="profile-actions">
                <button type="button" onClick={() => void handleSaveProfile()} disabled={!hasChanges || saving}>
                  {saving ? "Salvando..." : "Salvar perfil"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!hasChanges || saving}
                  onClick={() => {
                    setNameInput(initialSnapshot.name ?? "");
                    setAvatarUrl(initialSnapshot.avatarUrl);
                    setError(null);
                  }}
                >
                  Descartar mudanças
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Ações da conta</h2>
            <p>Saia da sessão atual ou exclua sua conta, quando necessário.</p>
          </div>
        </header>

        <div className="profile-actions">
          <button type="button" className="secondary-button" onClick={() => void handleLogout()} disabled={logoutLoading}>
            {logoutLoading ? "Saindo..." : "Sair"}
          </button>
          <button type="button" className="danger-button" onClick={() => void handleDeleteAccount()} disabled={deleting}>
            {deleting ? "Excluindo..." : "Excluir conta"}
          </button>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileSelected}
      />

      <AvatarCropModal
        open={cropOpen}
        imageSrc={cropImageSrc}
        onCancel={handleCloseCrop}
        onApply={handleApplyCroppedAvatar}
      />

      {toast && (
        <div className={toast.type === "success" ? "profile-toast profile-toast--success" : "profile-toast profile-toast--error"}>
          {toast.message}
        </div>
      )}
    </section>
  );
}
