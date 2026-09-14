#!/usr/bin/env python3
"""Synchronise les exercices ATP(A) avec les lignes étoilées du manuel PDF."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber


def clean_label(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def exercise_rows(page) -> list[str]:
    rows: list[str] = []
    for table in page.extract_tables():
        for row in table:
            if not any(cell and "*" in cell for cell in row):
                continue
            label = next(
                (
                    clean_label(cell)
                    for cell in row
                    if cell
                    and clean_label(cell)
                    and clean_label(cell).replace("*", "").strip()
                ),
                "",
            )
            if label:
                rows.append(label)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--program", required=True, type=Path)
    parser.add_argument("--manual", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    program = json.loads(args.program.read_text(encoding="utf-8"))
    components: list[dict] = []
    for lesson in program["lessons"]:
        for component_index, component in enumerate(lesson["components"]):
            components.append(
                {
                    "lesson": lesson,
                    "component": component,
                    "componentIndex": component_index,
                    "startPage": component["manualPdfPage"],
                }
            )
    components.sort(key=lambda item: item["startPage"])

    report: list[dict] = []
    with pdfplumber.open(args.manual) as manual:
        for index, item in enumerate(components):
            start_page = item["startPage"]
            end_page = (
                components[index + 1]["startPage"] - 1
                if index + 1 < len(components)
                else start_page
            )
            official_rows: list[str] = []
            for page_number in range(start_page, end_page + 1):
                official_rows.extend(exercise_rows(manual.pages[page_number - 1]))

            component = item["component"]
            old_rows = component.get("exercises", [])
            report.append(
                {
                    "lesson": item["lesson"]["number"],
                    "component": item["componentIndex"] + 1,
                    "modality": component["modality"],
                    "manualPages": (
                        str(start_page)
                        if start_page == end_page
                        else f"{start_page}-{end_page}"
                    ),
                    "before": len(old_rows),
                    "official": len(official_rows),
                    "changed": old_rows != official_rows,
                }
            )
            if args.write:
                component["exercises"] = official_rows
                component["evaluationItems"] = official_rows

    if args.write:
        for lesson in program["lessons"]:
            combined = [
                row
                for component in lesson["components"]
                for row in component["exercises"]
            ]
            lesson["exercises"] = combined
            lesson["evaluationItems"] = combined
        program["componentCount"] = len(components)
        program["evaluationComponentsParsed"] = len(components)
        program["exerciseRowsVerifiedFromManual"] = True
        program["exerciseRowsVerifiedCount"] = sum(
            len(component["component"]["exercises"]) for component in components
        )
        args.program.write_text(
            json.dumps(program, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(
            {
                "components": len(components),
                "changedComponents": sum(item["changed"] for item in report),
                "officialExerciseRows": sum(item["official"] for item in report),
                "details": report,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
