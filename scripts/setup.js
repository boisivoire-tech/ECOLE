import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import pg from "pg";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");

function runStep(label, command, args) {
  console.log(`\n▶ ${label}...`);
  const isWin = process.platform === "win32";
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: isWin,
  });
  if (result.status !== 0) {
    throw new Error(`La commande "${command} ${args.join(" ")}" a échoué.`);
  }
}

async function ensureDatabaseExists({ host, port, user, password, dbName }) {
  const safeDbName = dbName.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeDbName || safeDbName !== dbName) {
    throw new Error(
      "Le nom de la base de données ne doit contenir que des lettres, chiffres et underscores (_)."
    );
  }

  const adminClient = new pg.Client({
    host,
    port: Number(port),
    user,
    password,
    database: "postgres",
  });

  await adminClient.connect();
  try {
    const check = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [safeDbName]
    );
    if (check.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${safeDbName}"`);
      console.log(`✔ Base PostgreSQL "${safeDbName}" créée automatiquement.`);
    } else {
      console.log(`✔ Base PostgreSQL "${safeDbName}" déjà présente.`);
    }
  } finally {
    await adminClient.end();
  }
}

async function main() {
  console.log("==========================================================");
  console.log("  Assistant d'installation automatique — Portail scolaire");
  console.log("==========================================================\n");

  const rl = readline.createInterface({ input, output });
  try {
    let writeNewEnv = true;
    if (fs.existsSync(envPath)) {
      const answer = (
        await rl.question(
          "Un fichier .env existe déjà. Voulez-vous le reconfigurer ? (o/N) : "
        )
      )
        .trim()
        .toLowerCase();
      writeNewEnv = answer === "o" || answer === "oui" || answer === "y";
    }

    if (writeNewEnv) {
      const host =
        (await rl.question("Hôte PostgreSQL [127.0.0.1] : ")).trim() ||
        "127.0.0.1";
      const port =
        (await rl.question("Port PostgreSQL [5432] : ")).trim() || "5432";
      const user =
        (await rl.question("Utilisateur PostgreSQL [postgres] : ")).trim() ||
        "postgres";
      const password = await rl.question(
        "Mot de passe PostgreSQL choisi lors de l'installation : "
      );
      const dbName =
        (await rl.question("Nom de la base de données [portail_scolaire] : ")).trim() ||
        "portail_scolaire";
      const schoolName =
        (
          await rl.question(
            "Nom affiché de l'établissement [Groupe Scolaire Démo] : "
          )
        ).trim() || "Groupe Scolaire Démo";

      console.log("\n▶ Vérification de la connexion à PostgreSQL...");
      await ensureDatabaseExists({ host, port, user, password, dbName });

      const encodedUser = encodeURIComponent(user);
      const encodedPassword = encodeURIComponent(password);
      const databaseUrl = `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${dbName}?schema=public`;
      const sessionSecret = crypto.randomBytes(32).toString("hex");
      const escapedSchoolName = schoolName.replace(/"/g, "");

      const envContent = [
        "# Fichier généré automatiquement par npm run setup (ignoré par Git)",
        `DATABASE_URL="${databaseUrl}"`,
        `SESSION_SECRET="${sessionSecret}"`,
        'NODE_ENV="development"',
        "API_PORT=3001",
        "VITE_PORT=5173",
        `SCHOOL_NAME="${escapedSchoolName}"`,
        "SESSION_DURATION_HOURS=8",
        "",
      ].join("\n");

      fs.writeFileSync(envPath, envContent, { encoding: "utf8" });
      console.log("✔ Fichier .env créé proprement (encodage UTF-8, sans extension .txt).");
    }

    runStep("Génération du client Prisma", "npx", ["prisma", "generate"]);
    runStep("Création des tables dans PostgreSQL", "npx", [
      "prisma",
      "migrate",
      "deploy",
    ]);

    const seedAnswer = (
      await rl.question(
        "\nVoulez-vous charger les comptes fictifs de démonstration pour tester ? (O/n) : "
      )
    )
      .trim()
      .toLowerCase();

    if (seedAnswer !== "n" && seedAnswer !== "non") {
      runStep("Chargement des données fictives de démonstration", "npm", [
        "run",
        "db:seed",
      ]);
    }

    console.log("\n==========================================================");
    console.log("✔ Installation terminée avec succès !");
    console.log("Pour démarrer l'application, tapez maintenant : npm run dev");
    console.log("Puis ouvrez : http://localhost:5173");
    console.log("==========================================================\n");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("\n[ERREUR D'INSTALLATION]", err.message || err);
  console.error(
    "Vérifiez que PostgreSQL est bien démarré sous Windows 11 et que le mot de passe saisi est exact."
  );
  process.exit(1);
});
