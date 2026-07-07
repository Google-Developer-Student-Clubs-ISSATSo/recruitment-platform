<div align="center">

# GDGC Recruitment Platform

**The core team recruitment pipeline for GDGC-ISSATSO — from application to final decision, in one place.**

![Last Commit](https://img.shields.io/github/last-commit/Google-Developer-Student-Clubs-ISSATSo/recruitment-platform)
![Languages](https://img.shields.io/github/languages/count/Google-Developer-Student-Clubs-ISSATSo/recruitment-platform)
![License](https://img.shields.io/badge/license-Private-lightgrey)

![Tech Stack](https://skillicons.dev/icons?i=nextjs,typescript,tailwind,postgres,prisma,docker,vercel)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#-usage)
- [Testing](#-testing)
- [Credit](#-credit)

---

## 🎯 Overview

GDGC Recruitment Platform replaces the scattered forms, spreadsheets, manual sheet-copying, and
external booking links previously used to run **GDGC-ISSATSO's** annual core team recruitment.
It centralizes the entire process --- application intake, Phase 1 screening, interview
scheduling, and final decisions --- into one member-only platform, across the club's three
competitive committees: **Marketing (MKT)**, **Team Management (TM)**, and **Events & External
Relations (EER)**.

## ✨ Features

- 🔐 **Permission-based access control** --- no fixed roles, the TM Lead grants exactly the
  access each member needs, and can revoke or adjust it any time
- 📊 **Weighted Phase 1 scoring** --- configurable questions, coefficients, and note scales rank
  every applicant automatically
- 🤝 **Cross-committee interview panels** --- one interviewer per committee, self-claimed from an
  open board
- 📝 **Single shared interview notes** --- no more copying scores between spreadsheets
- 🖥️ **Live final decision dashboard** --- built for the actual Discord-call decision meeting
- 🔄 **In-app Admin Handoff** --- the TM Lead role transfers yearly via invite-and-accept, no
  manual credential handoff required
- 🗂️ **Full activity log** --- every meaningful action, visible to the TM Lead

## 🛠️ Tech Stack

| Layer     | Technology                                     |
| --------- | ---------------------------------------------- |
| Frontend  | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend   | Next.js API routes                             |
| Database  | PostgreSQL via Prisma                          |
| Local Dev | Docker (Postgres)                              |
| Hosting   | Vercel                                         |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm or pnpm
- [Docker](https://www.docker.com/)

### Installation

1. **Clone the repo**

   ```bash
   git clone git@github.com:Google-Developer-Student-Clubs-ISSATSo/recruitment-platform.git
   cd recruitment-platform
   ```

2. **Start the local database**

   ```bash
   docker compose up -d
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Configure environment variables**

   Create a `.env` file in the project root:

   ```
   DATABASE_URL="postgresql://gdgc:dev_password@localhost:5432/gdgc_recruitment"
   ```

5. **Run database migrations**

   ```bash
   npx prisma migrate dev
   ```

6. **Start the dev server**

   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000).

## 📖 Usage

Access is entirely permission-based --- there are no fixed job titles baked into the system, only
starting templates the TM Lead can customize per person:

| Role template            | Typical access                                                   |
| ------------------------ | ---------------------------------------------------------------- |
| Interviewer              | Claim panel seats, write interview notes for assigned applicants |
| TM Reviewer              | Phase 1 screening across the full applicant pool                 |
| Technical Scorer         | Score the Technical Skills column only                           |
| Committee Representative | Read access to their committee's final-decision dashboard        |
| TM Lead (Administrator)  | Full control, including granting/revoking anyone's permissions   |

Full process details, the permission catalog, and the data model live in
[`docs/PRODUCT_SPECIFICATION.md`](docs/PRODUCT_SPECIFICATION.md).

Ownership, credentials, and the yearly TM Lead / Tech Lead handoff procedures live in
[`docs/HANDOFF_RUNBOOK.md`](docs/HANDOFF_RUNBOOK.md).

## 🧪 Testing

Testing setup hasn't been added yet --- it's planned as part of the build process (full-flow and
permission edge-case testing) before the platform is used for a real recruitment cycle. This
section will be updated once test tooling is in place.

## 🙌 Credit

Built and maintained by the **GDGC-ISSATSO** tech team.

<div align="center">

Made with ❤️ for [Google Developer Group on Campus ISSAT Sousse](https://github.com/Google-Developer-Student-Clubs-ISSATSo)

</div>
