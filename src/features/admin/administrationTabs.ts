export const administrationTabs=["progress","cohorts","instructors","employees","programs","rates","quotes","settings"]as const;
export type AdministrationTab=typeof administrationTabs[number];
