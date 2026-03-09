const CPF_SIZE = 11;

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);

  if (cpf.length !== CPF_SIZE) {
    return false;
  }

  if (/^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const digits = cpf.split("").map(Number);
  const firstVerifier = calculateVerifier(digits.slice(0, 9), 10);
  const secondVerifier = calculateVerifier(digits.slice(0, 10), 11);

  return digits[9] === firstVerifier && digits[10] === secondVerifier;
}

function calculateVerifier(baseDigits: number[], initialWeight: number): number {
  const sum = baseDigits.reduce((acc, digit, index) => {
    return acc + digit * (initialWeight - index);
  }, 0);

  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

