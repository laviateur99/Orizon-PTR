import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { TuitionTaxForm } from "../types";
import { T2202_FORM_PATH } from "./versions";

const money = (value: number) => value.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });

// Format AAMM (4 caractères, sans séparateur — le "/" imprimé fait partie du gabarit officiel,
// la case elle-même est limitée à 4 caractères) à partir d'une date "AAAA-MM-JJ" du dossier
// finalisé — seule la présentation change, la date source n'est jamais modifiée.
const yearMonth = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1].slice(2)}${match[2]}` : "";
};

// Garde-fou : les cases officielles ont des longueurs maximales fixes (mesurées sur le vrai
// gabarit) — tronquer plutôt que de faire échouer la génération, jamais l'inverse.
const clip = (value: string, max: number) => value.slice(0, max);

// Mapping confirmé (règle métier déjà en place) — jamais le code 4 (hélicoptère, catégorie
// absente de notre interface) ; vérifié contre les options réelles du champ PDF officiel (1-6).
const courseTypeCode: Record<string, string> = {
  "Pilote privé": "1",
  "Pilote professionnel": "2",
  "Instructeur de vol": "3",
  "Vol aux instruments": "5",
  "Autre": "6"
};

// Le nom interne "RT1/RT/RT2" du champ officiel (Filer Account Number, case 15) est un artefact
// d'un gabarit CRA générique — la valeur métier attendue est un numéro de compte RZ, jamais RT.
// On ne remplit ce triplet que si le numéro suit le format standard NNNNNNNNN PP NNNN ; sinon on
// laisse les trois segments vides plutôt que de deviner un découpage.
function splitAccountNumber(value: string): [string, string, string] | null {
  const match = value.trim().match(/^(\d{9})\s*([A-Za-z]{2})\s*(\d{4})$/);
  return match ? [match[1], match[2].toUpperCase(), match[3]] : null;
}

// Les deux certificats identiques imprimés sur la page 1 ("For student 1" / "2") utilisent deux
// arborescences de champs parallèles, avec une irrégularité de nommage sur le conteneur du numéro
// de compte (Part1_15 pour le premier certificat, Part1_box15 pour le second).
type CertificatePart = "Part1_form" | "Part2_form";
function fieldNames(part: CertificatePart) {
  const base = `form1[0].Page1[0].${part}[0]`;
  const accountContainer = part === "Part1_form" ? "Part1_15" : "Part1_box15";
  // Irrégularité du gabarit officiel : le tableau des sessions est imbriqué sous un conteneur
  // "Part1_Table[0]" supplémentaire pour le premier certificat seulement.
  const table = part === "Part1_form" ? `${base}.Part1_Form[0].Part1_Table[0]` : `${base}.Part1_Form[0]`;
  return {
    year: `${base}.Year[0].Slip1Year[0]`,
    nameAddress: `${base}.Part1_Form[0].Part1_Name_Address[0].Part1_Name_Address[0]`,
    schoolType: `${base}.Part1_Form[0].Part1_box11[0].Part1_box11_schoolType[0]`,
    flyingSchool: `${base}.Part1_Form[0].Part1_box12[0].Part1_box12_FlyingSchool[0]`,
    programName: `${base}.Part1_Form[0].Part1_box13[0].Part1_box13_nameProgram[0]`,
    studentNumber: `${base}.Part1_Form[0].Part1_box14[0].Part1_box14_StudentNumber[0]`,
    accountRt1: `${base}.Part1_Form[0].${accountContainer}[0].Account_Number_Comb_EN[0].Account_Number_RT1[0]`,
    accountRt: `${base}.Part1_Form[0].${accountContainer}[0].Account_Number_Comb_EN[0].Account_Number_RT[0]`,
    accountRt2: `${base}.Part1_Form[0].${accountContainer}[0].Account_Number_Comb_EN[0].Account_Number_RT2[0]`,
    studentName: `${base}.Part1_Form[0].Part1_StudentName[0].Part1_studentName[0]`,
    studentAddress: `${base}.Part1_Form[0].Part1_Student_Address[0].Part1_StudentAddr[0]`,
    // SIN volontairement absent d'ici : jamais lu, jamais référencé, jamais rempli.
    dateFrom: `${table}.Part1_session1[0].Part1_row1_box19[0].Row1_Date_1[0]`,
    dateTo: `${table}.Part1_session1[0].Part1_Row1_To[0].Row1_Date_2[0]`,
    partTimeMonths: `${table}.Part1_session1[0].box21_row1[0]`,
    fullTimeMonths: `${table}.Part1_session1[0].box22_row1[0]`,
    eligibleFees: `${table}.Part1_session1[0].box23_row1[0]`,
    totalPartTimeMonths: `${table}.Part1_sessiontotal[0].Totals_Box21_row5[0]`,
    totalFullTimeMonths: `${table}.Part1_sessiontotal[0].Totals_Box25_row5[0]`,
    totalEligibleFees: `${table}.Part1_sessiontotal[0].Totals_Box26_row5[0]`
  };
}

/**
 * Remplit le vrai T2202 officiel de l'ARC (gabarit AcroForm+XFA hybride, T2202_FORM_VERSION) à
 * partir d'un dossier fiscal FINALISÉ uniquement — aucune lecture PTR/réservations/tarifs
 * courants. Retourne les octets du PDF final aplati (non interactif).
 */
export async function buildT2202Pdf(taxForm: TuitionTaxForm): Promise<Uint8Array> {
  const templateBytes = await readFile(join(process.cwd(), "public", T2202_FORM_PATH));
  // pdf-lib ne lit/n'écrit pas le paquet XFA : le charger ainsi le supprime déjà proprement du
  // document (nécessaire pour que les valeurs remplies soient visibles dans tous les lecteurs,
  // pas seulement Adobe Reader, qui privilégierait sinon le paquet XFA sur les champs AcroForm).
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdf.getForm();

  const institution = taxForm.institutionSnapshot;
  const student = taxForm.studentSnapshot;
  const institutionAddress = [institution?.name, institution?.address, [institution?.city, institution?.province, institution?.postalCode].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  const studentAddress = [student.address, [student.city, student.province, student.postalCode].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  const accountParts = institution?.craT2202FilerAccountNumber ? splitAccountNumber(institution.craT2202FilerAccountNumber) : null;

  for (const part of ["Part1_form", "Part2_form"] as const) {
    const names = fieldNames(part);
    form.getTextField(names.year).setText(String(taxForm.taxYear));
    form.getTextField(names.nameAddress).setText(institutionAddress);
    form.getDropdown(names.schoolType).select("5");
    if (taxForm.t2202.courseType && courseTypeCode[taxForm.t2202.courseType]) form.getDropdown(names.flyingSchool).select(courseTypeCode[taxForm.t2202.courseType]);
    form.getTextField(names.programName).setText(clip(taxForm.t2202.programName, 30));
    form.getTextField(names.studentNumber).setText(clip(student.studentNumber, 20));
    // RZ si disponible et bien formé, jamais RT en substitut, jamais inventé : cases vides sinon.
    if (accountParts) {
      form.getTextField(names.accountRt1).setText(accountParts[0]);
      form.getTextField(names.accountRt).setText(accountParts[1]);
      form.getTextField(names.accountRt2).setText(accountParts[2]);
    }
    form.getTextField(names.studentName).setText(`${student.firstName} ${student.lastName}`.trim());
    form.getTextField(names.studentAddress).setText(studentAddress);
    form.getTextField(names.dateFrom).setText(clip(yearMonth(taxForm.t2202.sessionStart), 4));
    form.getTextField(names.dateTo).setText(clip(yearMonth(taxForm.t2202.sessionEnd), 4));
    form.getTextField(names.partTimeMonths).setText(clip(String(taxForm.t2202.partTimeMonths), 2));
    form.getTextField(names.fullTimeMonths).setText(clip(String(taxForm.t2202.fullTimeMonths), 2));
    form.getTextField(names.eligibleFees).setText(money(taxForm.t2202.eligibleTuitionFees));
    // Un seul palier de session dans notre modèle actuel : les totaux reprennent ses valeurs.
    form.getTextField(names.totalPartTimeMonths).setText(clip(String(taxForm.t2202.partTimeMonths), 2));
    form.getTextField(names.totalFullTimeMonths).setText(clip(String(taxForm.t2202.fullTimeMonths), 2));
    form.getTextField(names.totalEligibleFees).setText(money(taxForm.t2202.eligibleTuitionFees));
  }

  form.flatten();
  return pdf.save();
}
