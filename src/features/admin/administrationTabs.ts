export const administrationTabs=["progress","cohorts","instructors","employees","programs","settings"]as const;
export type AdministrationTab=typeof administrationTabs[number];
