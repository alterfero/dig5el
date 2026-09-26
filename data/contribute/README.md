# Conversational questionnaire instruments

The six original questionnaire JSON files were copied without modification from
DIG4EL v1 (`alterfero/dig4el`, `questionnaires/`) for the Contribute interface.
They are instruments, not contributed language recordings. The original UIDs,
dialogue, semantic graphs, speaker metadata, and legacy indices are retained.

Source: https://github.com/alterfero/dig4el
Author: Sebastien CHRISTIAN, University of French Polynesia.
The source application is licensed under AGPL-3.0-or-later. The questionnaires
adapt Alexandre François's Conversational Questionnaires:
https://hal.science/hal-02061237/document

The original English prompts remain English when the interface locale changes.
The interface never fabricates target-language translations or annotations.

The Excel template archive at `public/contribute/dcq-excel-templates.zip` and the
regression fixture `tests/fixtures/contribute/family-album-v1.xlsx` were copied
from v1's `templates/cq_spreadsheets/` without changing their workbook contents.
DCQ import follows v1's `libs/output_generation_utils.py`: the `Info` sheet
identifies the questionnaire, and `Transcription` groups utterances and their
concept rows. Both the older `Language under study` and newer `Target language`
metadata labels are supported. Imported legacy indices are matched to the
canonical instrument; imported review status is never trusted.

## Use in DIG4EL 2

`server/contribute/templates.ts` imports these six files on the server. The
Contribute page receives their UID/title/context/utterance-count summaries; an
authenticated request fetches the full chosen instrument. Do not rename UIDs
or utterance keys: legacy DCQ recordings are matched using those identifiers.

Starting a questionnaire copies its prompts and concept/intent labels into a
DIG4EL draft, preserving the full instrument as its original. Importing a legacy
recording also retains that recording. Old semantic graphs and `concept_words`
are preserved data, not automatically migrated editable word links. See the
[Contribute guide](../../docs/contribute.md#questionnaires-dcq).

When adding or replacing an instrument, update the server template registry and
verify legacy import compatibility. Keep source attribution and the original
instrument content separate from contributed translations.
