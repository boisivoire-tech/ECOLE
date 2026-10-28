import "dotenv/config";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { prisma } from "../server/db.js";
import { hashSecret } from "../server/utils/crypto.js";
import { normalizeText, validateEmail, validatePassword } from "../server/utils/validation.js";

/**
 * Lecteur de lignes compatible à la fois avec la saisie clavier interactive
 * dans Windows PowerShell et avec le copier-coller / flux redirigé.
 */
function createPromptReader() {
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  const bufferedLines = [];
  const waitingResolvers = [];
  let closed = false;

  rl.on("line", (line) => {
    if (waitingResolvers.length > 0) {
      const resolve = waitingResolvers.shift();
      resolve(line);
    } else {
      bufferedLines.push(line);
    }
  });

  rl.on("close", () => {
    closed = true;
    while (waitingResolvers.length > 0) {
      const resolve = waitingResolvers.shift();
      resolve("");
    }
  });

  return {
    ask(promptText) {
      output.write(promptText);
      if (bufferedLines.length > 0) {
        const line = bufferedLines.shift();
        if (!input.isTTY) output.write("\n");
        return Promise.resolve(line);
      }
      if (closed) {
        return Promise.resolve("");
      }
      return new Promise((resolve) => {
        waitingResolvers.push(resolve);
      });
    },
    close() {
      rl.close();
    },
  };
}

async function main() {
  const reader = createPromptReader();

  console.log("==============================================================");
  console.log("  PORTAIL SCOLAIRE — Création du premier compte Administrateur");
  console.log("==============================================================\n");

  try {
    const schoolNameInput = await reader.ask(
      "1. Nom de votre établissement scolaire (ex. Collège Moderne) : "
    );
    const firstNameInput = await reader.ask("2. Prénom de l'administrateur : ");
    const lastNameInput = await reader.ask("3. Nom de famille de l'administrateur : ");
    const emailInput = await reader.ask("4. Adresse e-mail de connexion : ");
    const passwordInput = await reader.ask(
      "5. Choisissez un mot de passe (10 caractères minimum) : "
    );
    const confirmInput = await reader.ask("6. Confirmez le mot de passe : ");

    if (passwordInput !== confirmInput) {
      throw new Error("Les deux mots de passe saisis ne correspondent pas.");
    }

    const schoolName = normalizeText(schoolNameInput, "Nom de l'établissement", {
      min: 2,
      max: 120,
    });
    const firstName = normalizeText(firstNameInput, "Prénom", { min: 1, max: 80 });
    const lastName = normalizeText(lastNameInput, "Nom de famille", { min: 1, max: 80 });
    const email = validateEmail(emailInput, { required: true });
    const password = validatePassword(passwordInput);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error(`Un compte utilise déjà l'adresse e-mail « ${email} ».`);
    }

    const passwordHash = await hashSecret(password);

    await prisma.$transaction([
      prisma.schoolSettings.upsert({
        where: { id: 1 },
        create: { id: 1, schoolName, showAbsences: true, showRemarks: true },
        update: { schoolName },
      }),
      prisma.user.create({
        data: {
          role: "ADMIN",
          email,
          passwordHash,
          firstName,
          lastName,
          isActive: true,
        },
      }),
    ]);

    console.log("\n[SUCCÈS] Le compte administrateur a été créé avec succès !");
    console.log(`- Établissement : ${schoolName}`);
    console.log(`- Administrateur : ${firstName} ${lastName} (${email})`);
    console.log("- Le mot de passe a été chiffré (haché) de façon irréversible.\n");
  } catch (err) {
    console.error(`\n[ERREUR] ${err.message}`);
    process.exitCode = 1;
  } finally {
    reader.close();
    await prisma.$disconnect();
  }
}

main();
