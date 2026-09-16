export const administrationTabs=["progress","cohorts","instructors","employees","programs","rates","quotes","tuition","settings"]as const;
export type AdministrationTab=typeof administrationTabs[number];
