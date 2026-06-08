# Responsiva y Consentimiento Informado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete digital liability waiver flow (Responsiva y Consentimiento) with signature pad, booking gate, and profile view page.

**Architecture:** Three new components/files (`responsivaContent.ts`, `SignaturePad.tsx`, `ResponsivaDialog.tsx`), one new page (`Responsiva.tsx`), and edits to `BookClassConfirm.tsx`, `Profile.tsx`, and `App.tsx`. The booking gate intercepts 403/WAIVER_REQUIRED and opens the dialog; on sign success it retries the mutation.

**Tech Stack:** React, TypeScript, Vite, react-query, axios (`@/lib/api`), lucide-react, shadcn Dialog (`@/components/ui/dialog`), ALMA tokens.

---

### Task 1: Content constant

**Files:**
- Create: `src/components/app/responsivaContent.ts`

- [ ] **Step 1: Create the file**

```ts
export const RESPONSIVA_VERSION = "v1";
export const RESPONSIVA_TITLE = "Alma Movement — Responsiva y Consentimiento Informado";
export const RESPONSIVA_SECTIONS = [
  { n: "1", title: "Aceptación de riesgo", body: "Participo de forma voluntaria en las clases..." },
  // ... (full content per spec)
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/app/responsivaContent.ts
git commit -m "feat(responsiva): content constant"
```

### Task 2: SignaturePad component

**Files:**
- Create: `src/components/app/SignaturePad.tsx`

- [ ] **Step 1: Implement canvas-based signature pad**

- [ ] **Step 2: Verify TypeScript passes** (`npm run build` or `tsc --noEmit`)

### Task 3: ResponsivaDialog component

**Files:**
- Create: `src/components/app/ResponsivaDialog.tsx`

- [ ] **Step 1: Implement modal with form, signature, consent, submit**

### Task 4: Responsiva view page

**Files:**
- Create: `src/pages/client/Responsiva.tsx`

- [ ] **Step 1: Implement page that fetches GET /api/me/waiver and renders document or empty state**

### Task 5: Integrate BookClassConfirm gate

**Files:**
- Modify: `src/pages/client/BookClassConfirm.tsx`

- [ ] **Step 1: Add waiverOpen state and onError intercept in bookMutation**
- [ ] **Step 2: Render ResponsivaDialog**

### Task 6: Profile link + App route

**Files:**
- Modify: `src/pages/client/Profile.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add ListRow "Mi responsiva" in Profile Cuenta section**
- [ ] **Step 2: Add Route in App.tsx**

### Task 7: Build verification + commit

- [ ] **Step 1: `npm run build` — fix any TS errors**
- [ ] **Step 2: Full commit**
