import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Un seul worker : tous les tests partagent la même instance d'émulateur Firestore
    // (plusieurs "projets" de test y cohabitent, un par étape de règles).
    fileParallelism: false,
  },
});
