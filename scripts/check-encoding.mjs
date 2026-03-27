import fs from "node:fs";
import path from "node:path";

const defaultTargets = ["apps/api/src", "apps/web/src"];
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTargets;
const repoRoot = process.cwd();

const ignoredDirNames = new Set([".git", "node_modules", "dist", "coverage", ".next"]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
  ".md",
  ".yml",
  ".yaml"
]);

const suspiciousPatterns = [
  { label: "sequência mojibake (Ã)", regex: /Ã[\u0080-\u00FF]/g },
  { label: "sequência mojibake (Â)", regex: /Â[\u0080-\u00FF]/g },
  { label: "caractere inválido (�)", regex: /�/g }
];

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(dirPath, output) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") {
      if (entry.name !== ".well-known") {
        continue;
      }
    }

    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) {
        continue;
      }
      walk(absolutePath, output);
      continue;
    }

    if (entry.isFile() && isTextFile(absolutePath)) {
      output.push(absolutePath);
    }
  }
}

function findIssuesInFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const issues = [];

  lines.forEach((line, index) => {
    suspiciousPatterns.forEach((pattern) => {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        issues.push({
          filePath,
          line: index + 1,
          label: pattern.label,
          preview: line.trim().slice(0, 180)
        });
      }
    });
  });

  return issues;
}

const filesToCheck = [];
targets.forEach((target) => {
  const absoluteTarget = path.resolve(repoRoot, target);
  walk(absoluteTarget, filesToCheck);
});

const issues = filesToCheck.flatMap(findIssuesInFile);
if (issues.length > 0) {
  console.error("\n[encoding-check] Foram encontrados textos com possível encoding inválido:\n");
  issues.slice(0, 200).forEach((issue) => {
    const relativeFile = path.relative(repoRoot, issue.filePath).replaceAll("\\", "/");
    console.error(`- ${relativeFile}:${issue.line} [${issue.label}]`);
    console.error(`  ${issue.preview}`);
  });

  if (issues.length > 200) {
    console.error(`\n... e mais ${issues.length - 200} ocorrência(s).`);
  }

  console.error(
    "\n[encoding-check] Corrija os textos para UTF-8 (acentos e cedilhas corretos) antes de executar build/test.\n"
  );
  process.exit(1);
}

console.log(`[encoding-check] OK: ${filesToCheck.length} arquivo(s) verificado(s), sem mojibake.`);
