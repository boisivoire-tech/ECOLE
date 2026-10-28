# Portail scolaire

Application web complète en français permettant à un établissement scolaire de publier en toute confidentialité les notes, les moyennes par matière et les moyennes générales des élèves.

> **Important :** Ce projet est configuré pour le développement et les tests locaux sur votre ordinateur (Windows 11). Il n'est **pas** publié en ligne par défaut et nécessite les étapes décrites à la section 9 avant toute mise en production réelle.

---

## 1. Technologies utilisées

Conformément au cahier des charges, l'application repose sur une architecture unique et cohérente :

- **Front-end :** React 19 + Vite 6 (interface en français adaptée aux téléphones et aux ordinateurs).
- **Back-end :** Node.js + Express (API REST, validation côté serveur, contrôle strict des droits).
- **Base de données :** PostgreSQL.
- **Accès aux données :** Prisma ORM (`prisma` et `@prisma/client`).

### Petites bibliothèques complémentaires indispensables (et pourquoi)

1. **`pg` et `@prisma/adapter-pg`** : pilote officiel permettant à Prisma 7 de communiquer avec PostgreSQL.
2. **`express-session`** : gestion des sessions sécurisées par cookie `HttpOnly` (les sessions elles-mêmes sont enregistrées dans PostgreSQL via Prisma).
3. **`dotenv`** : lecture sécurisée du fichier `.env` afin de ne jamais écrire de mot de passe ou de clé secrète dans le code source.

*(Le hachage des mots de passe et des codes à usage unique utilise le module cryptographique natif `node:crypto` (`scrypt` + `timingSafeEqual`) intégré à Node.js, sans dépendance externe supplémentaire.)*

---

## 2. Arborescence du projet

```text
ECOLE/
├── .env.example                 # Modèle de configuration sans aucun vrai secret
├── .gitignore                   # Empêche l'envoi de .env et node_modules sur Git
├── index.html                   # Page d'entrée HTML en français
├── package.json                 # Commandes et dépendances du projet
├── prisma.config.mjs            # Configuration Prisma (connexion PostgreSQL)
├── vite.config.js               # Configuration Vite (React + relais /api vers Express)
├── README.md                    # Ce guide pas-à-pas pour Windows 11
├── scripts/
│   └── dev.js                   # Lance Express et Vite ensemble avec une seule commande
├── prisma/
│   ├── schema.prisma            # Modèles PostgreSQL et contraintes d'unicité
│   ├── migrations/
│   │   ├── migration_lock.toml
│   │   └── 20261028000000_init/
│   │       └── migration.sql    # Script SQL de création des tables PostgreSQL
│   ├── create-admin.js          # Assistant interactif pour créer le 1er compte administrateur
│   └── seed.js                  # Données FICTIVES de démonstration (bloquées en production)
├── server/
│   ├── index.js                 # Démarrage du serveur Express
│   ├── app.js                   # Sessions sécurisées, en-têtes HTTP, CSRF, routes
│   ├── db.js                    # Connexion Prisma + PostgreSQL
│   ├── middleware/
│   │   ├── auth.js              # Vérification de session, rôles et protection CSRF
│   │   └── rateLimit.js         # Anti-force brute et anti-balayage de matricules
│   ├── routes/
│   │   ├── auth.js              # Connexion Personnel + Connexion Parent en 2 étapes (OTP)
│   │   ├── admin.js             # Gestion complète réservée à l'administrateur
│   │   ├── teacher.js           # Saisie et correction des notes par l'enseignant autorisé
│   │   └── parent.js            # Consultation des bulletins des enfants liés uniquement
│   └── utils/
│       ├── crypto.js            # Hachage scrypt des mots de passe et codes OTP
│       ├── grades.js            # Calcul des moyennes par matière et moyenne générale
│       ├── logger.js            # Journaux sans notes, dates de naissance ni secrets
│       ├── sessionStore.js      # Stockage des sessions en base PostgreSQL
│       └── validation.js        # Validation stricte des valeurs côté serveur
└── src/
    ├── main.jsx                 # Point d'entrée React
    ├── App.jsx                  # Aiguillage selon la session et le rôle
    ├── api/
    │   └── client.js            # Appels API sécurisés (cookies + jeton CSRF)
    ├── components/
    │   ├── AdminBulletinSupervisor.jsx # Supervision et correction des bulletins/notes
    │   ├── AlertBanner.jsx      # Bandeaux d'alerte et de confirmation visuelle
    │   ├── ConfirmModal.jsx     # Fenêtre de confirmation avant suppression/modification
    │   └── Header.jsx           # En-tête, changement de mot de passe et déconnexion
    ├── pages/
    │   ├── LoginPage.jsx        # Connexion Parent (2 étapes + OTP) et Personnel
    │   ├── ParentDashboard.jsx  # Tableau de bord enfants + relevés par trimestre/année
    │   ├── TeacherDashboard.jsx # Saisie et correction des notes par classe/matière
    │   └── AdminDashboard.jsx   # Gestion complète de l'établissement et des codes OTP
    └── styles/
        └── app.css              # Feuille de style responsive téléphone, PC et impression
├── tests/
│   ├── unit.test.js             # Tests unitaires (calculs moyennes, scrypt, validations)
│   └── integration.test.js      # Tests bout-en-bout API, sécurité OTP, CSRF et journaux
```

---

## 3. Prérequis sur Windows 11

Avant de commencer, installez ces deux logiciels gratuits si vous ne les avez pas encore :

1. **Node.js (version LTS 20 ou 22)** : téléchargez l'installateur Windows (`.msi`) sur le site officiel de Node.js, puis cliquez sur « Suivant » jusqu'à la fin.
2. **PostgreSQL (version 16 ou 17)** : téléchargez l'installateur Windows. Pendant l'installation :
   - Laissez le port par défaut `5432`.
   - Choisissez et **notez précieusement** le mot de passe du super-utilisateur `postgres`.

Ouvrez ensuite **Windows PowerShell** (menu Démarrer → tapez `PowerShell`) et vérifiez l'installation :

```powershell
node -v
npm -v
psql --version
```

*(Astuce : si `psql --version` n'est pas reconnu, utilisez l'application **SQL Shell (psql)** installée automatiquement par PostgreSQL dans le menu Démarrer de Windows 11.)*

---

## 4. Créer la base de données PostgreSQL (Windows 11)

Ouvrez **SQL Shell (psql)** dans le menu Démarrer de Windows 11 :
- Appuyez sur `Entrée` pour conserver les valeurs par défaut (`Server [localhost]`, `Database [postgres]`, `Port [5432]`, `Username [postgres]`).
- Tapez le mot de passe PostgreSQL que vous avez choisi à l'installation, puis appuyez sur `Entrée`.
- Copiez-collez cette commande SQL (n'oubliez pas le point-virgule final) :

```sql
CREATE DATABASE portail_scolaire ENCODING 'UTF8';
\q
```

---

## 5. Installation et configuration du fichier `.env` sur Windows 11

Toutes les commandes suivantes s'exécutent dans **PowerShell**, **à l'intérieur du dossier racine du projet** (par exemple `C:\projets\ECOLE`).

### Étape 5.1 — Aller dans le dossier du projet et installer les paquets

Dans `C:\projets\ECOLE` :

```powershell
cd C:\projets\ECOLE
npm install
```

### Étape 5.2 — Créer votre fichier `.env` et générer un secret de session

Toujours dans `C:\projets\ECOLE` :

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

La deuxième commande affiche une longue suite aléatoire de lettres et de chiffres. Ouvrez le fichier `.env` avec le **Bloc-notes** (`notepad .env`) :

1. Dans `DATABASE_URL`, remplacez `REMPLACER_PAR_VOTRE_MOT_DE_PASSE_POSTGRES` par votre vrai mot de passe PostgreSQL local.
2. Dans `SESSION_SECRET`, collez la longue chaîne aléatoire générée à l'instant.
3. Enregistrez et fermez le Bloc-notes (`Ctrl + S`).

### Étape 5.3 — Créer les tables dans PostgreSQL avec Prisma

Toujours dans `C:\projets\ECOLE` :

```powershell
npx prisma generate
npx prisma migrate deploy
```

---

## 6. Créer le premier compte Administrateur (ou charger les données fictives)

### Option A — Créer votre premier vrai compte Administrateur (base propre)

Dans le dossier `C:\projets\ECOLE`, exécutez :

```powershell
npm run admin:create
```

Répondez simplement aux 6 questions affichées en français (nom de l'établissement, prénom, nom, e-mail, mot de passe d'au moins 10 caractères). Votre mot de passe est immédiatement haché avec `scrypt` avant d'être enregistré.

### Option B — Charger les exemples de données FICTIVES de démonstration

Pour tester immédiatement l'application avec des classes, élèves, notes et comptes fictifs prêts à l'emploi, exécutez dans `C:\projets\ECOLE` :

```powershell
npm run db:seed
```

#### Récapitulatif des comptes FICTIFS de démonstration (`prisma/seed.js`)

| Rôle (Fictif) | Identifiant / Élève fictif | Secret de test fictif |
| :--- | :--- | :--- |
| **Administrateur fictif** | `admin.fictif@ecole-demo.local` | Mot de passe : `DemoAdmin-2026!` |
| **Enseignant 1 fictif** (Maths & SVT) | `enseignant1.fictif@ecole-demo.local` | Mot de passe : `DemoProf1-2026!` |
| **Enseignant 2 fictif** (Français, HG, Anglais) | `enseignant2.fictif@ecole-demo.local` | Mot de passe : `DemoProf2-2026!` |
| **Parent 1 fictif** (M. Kouassi Yao — 2 enfants) | Matricule : `ELV-DEMO-001` • Nom : `Yao` • Naissance : `2014-05-15` *(ou `ELV-DEMO-002` / `Yao` / `2011-11-03`)* | Code à usage unique initial : `DEMO-7429` |
| **Parent 2 fictif** (Mme Fatou Bamba — 1 enfant) | Matricule : `ELV-DEMO-003` • Nom : `Bamba` • Naissance : `2014-02-22` | Code à usage unique initial : `DEMO-9384` |

*(Rappel : un code à usage unique parent ne fonctionne qu'**une seule fois**. Pour reconnecter un parent une seconde fois, connectez-vous en Administrateur → onglet « Parents & Codes d'accès » → cliquez sur « Générer un code OTP ».)*

---

## 7. Démarrer l'application sur Windows 11

Dans le dossier `C:\projets\ECOLE`, lancez :

```powershell
npm run dev
```

Ouvrez ensuite votre navigateur (Edge, Chrome ou Firefox) à l'adresse :

- **`http://localhost:5173`**

Pour arrêter l'application dans PowerShell, appuyez sur `Ctrl + C`.

### Lancer la suite de tests automatisés (Windows 11)

Pour vérifier automatiquement tous les calculs de moyennes, le hachage `scrypt`, la protection CSRF, la connexion parent en 2 étapes, l'usage unique des codes OTP, le blocage anti-force brute (`429`) et l'absence de données sensibles dans les journaux, exécutez dans `C:\projets\ECOLE` :

```powershell
npm test
```

---

## 8. Procédure de vérification manuelle complète

1. **Saisie d'une note par un enseignant :**
   - Ouvrez `http://localhost:5173` → onglet **« Enseignants & Administration »**.
   - Connectez-vous avec `enseignant1.fictif@ecole-demo.local` et `DemoProf1-2026!`.
   - Vérifiez que seules ses matières attribuées (`Mathématiques` et `SVT`) apparaissent, jamais `Français`.
   - Sélectionnez `6ème A — Mathématiques (Coef. 4)` et `1er Trimestre`.
   - Ajoutez une note pour `YAO Aya Marie (ELV-DEMO-001)` : intitulé `Interrogation n°2`, note `18`, pondération `1`.
   - Cliquez sur **« Se déconnecter »**.

2. **Consultation sécurisée par le parent :**
   - Sur l'onglet **« Parents d'élèves »** (Étape 1 sur 2), saisissez :
     - Matricule : `ELV-DEMO-001`
     - Nom de famille : `Yao`
     - Date de naissance : `2014-05-15`
   - Cliquez sur **« Continuer vers l'étape 2 »** : aucune note n'est visible tant que le code à usage unique n'est pas validé.
   - À l'Étape 2 sur 2, saisissez le code à usage unique `DEMO-7429` puis validez.
   - Vérifiez que M. Yao voit uniquement ses deux enfants (`Aya Marie` et `Koffi Marc`), que la nouvelle note `18,00` apparaît en Mathématiques, que la moyenne par matière, la moyenne générale et la **date de dernière mise à jour** sont actualisées.
   - Déconnectez-vous et essayez de réutiliser `DEMO-7429` : l'accès est refusé car le code à usage unique a déjà été consommé.

3. **Génération d'un nouveau code parent et test d'affichage des absences :**
   - Connectez-vous en Administrateur (`admin.fictif@ecole-demo.local` / `DemoAdmin-2026!`).
   - Dans **« Paramètres & Vue globale »**, décochez l'affichage des absences, confirmez dans la boîte de dialogue, puis enregistrez.
   - Dans **« Parents & Codes d'accès »**, cliquez sur **« Générer un code OTP »** sur la ligne de `YAO Kouassi`, confirmez et copiez le nouveau code affiché.

---

## 9. Limites de la version de démonstration et étapes avant mise en ligne

### Limites actuelles de cette version locale

- **Remise manuelle du code à usage unique :** l'administrateur génère le code à l'écran et le remet ou l'envoie manuellement au parent (aucun serveur SMS ou e-mail transactionnel externe n'est branché).
- **Limitation de débit en mémoire vive :** les compteurs anti-force brute (`rateLimit.js`) sont conservés dans la mémoire du processus Node.js (suffisant pour un serveur unique, mais réinitialisé au redémarrage du serveur).
- **Pas de chiffrement HTTPS local :** sur `localhost`, la communication utilise `http://`.
- **Pas de sauvegarde externe automatisée :** la base PostgreSQL tourne uniquement sur votre poste local.

### Étapes indispensables avant de publier l'application sur Internet

1. **Ne jamais exécuter `npm run db:seed` en production** : partir d'une base propre (`npx prisma migrate deploy`) et créer un compte administrateur réel via `npm run admin:create` avec un mot de passe robuste et unique.
2. **Activer HTTPS obligatoire (TLS)** : placer l'application derrière un proxy inverse sécurisé (Nginx, Caddy ou hébergeur cloud géré) avec un certificat TLS valide et définir `NODE_ENV="production"` dans `.env` (ce qui active automatiquement le cookie `Secure` et l'en-tête `X-Frame-Options: DENY`).
3. **Sécuriser PostgreSQL** : utiliser un compte PostgreSQL dédié (non super-utilisateur), un mot de passe fort, restreindre l'accès réseau au seul serveur Express (pare-feu) et planifier des sauvegardes chiffrées quotidiennes (`pg_dump`) testées régulièrement.
4. **Automatiser l'envoi des codes OTP** : connecter un prestataire transactionnel d'e-mail ou de SMS conforme à la réglementation sur la protection des données scolaires.
5. **Journalisation d'audit et supervision** : conserver les journaux d'accès administratifs sur un stockage dédié et mettre à jour régulièrement Node.js, PostgreSQL et les dépendances npm (`npm audit`).

---

## 10. Rôle de GitHub et mise en ligne depuis le dépôt `ECOLE`

### Ce que fait GitHub directement
- **Sauvegarde et historique du code** dans votre dépôt GitHub `boisivoire-tech/ECOLE`.
- **Vérification automatique (GitHub Actions)** via `.github/workflows/ci.yml` : à chaque envoi sur GitHub, un serveur de test temporaire lance PostgreSQL 16, crée les tables Prisma, exécute les 10 tests de sécurité/calculs (`npm test`) et vérifie la compilation React (`npm run build`).
- **Pourquoi GitHub Pages ne suffit pas ici :** GitHub Pages ne peut publier que des pages fixes (HTML/CSS) sans serveur ni base de données. Or « Portail scolaire » a besoin d'un serveur **Node.js + Express** actif et d'une base **PostgreSQL** pour protéger les notes et les sessions des parents.

### Comment mettre l'application en ligne (HTTPS) à partir de votre dépôt GitHub

Un fichier `render.yaml` (sans aucun secret) est inclus à la racine du projet pour connecter facilement votre dépôt GitHub à un hébergeur cloud supportant **Node.js + PostgreSQL** (comme **Render** ou **Railway**) :

1. Fusionnez la Pull Request sur la branche `main` de votre dépôt GitHub `boisivoire-tech/ECOLE` (et passez le dépôt en **Privé** dans *Settings → Change visibility* si vous le souhaitez).
2. Créez un compte sur un hébergeur Node.js + PostgreSQL (par exemple Render.com) et cliquez sur **New + → Blueprint**.
3. Sélectionnez votre dépôt GitHub `boisivoire-tech/ECOLE` : l'hébergeur lit `render.yaml`, crée automatiquement la base PostgreSQL, génère un `SESSION_SECRET` aléatoire, active `NODE_ENV=production` et sert l'application en **HTTPS**.
4. Une fois le service démarré, ouvrez l'onglet **Shell** de votre hébergeur et tapez `npm run admin:create` pour créer votre premier vrai compte administrateur (sans charger les données fictives).

