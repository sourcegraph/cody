import * as fspromises from 'fs/promises'

import { createObjectCsvWriter } from 'csv-writer'
import type { CsvWriter } from 'csv-writer/src/lib/csv-writer'
import { rimraf } from 'rimraf'

import { type EvaluationDocument, autocompleteItemHeaders } from './EvaluationDocument'
import type { EvaluateAutocompleteOptions } from './evaluate-autocomplete'

export class SnapshotWriter {
    public csvWriter: CsvWriter<any> | undefined
    constructor(
        public readonly options: Pick<EvaluateAutocompleteOptions, 'snapshotDirectory' | 'csvPath'>
    ) {}
    public async writeHeader(): Promise<void> {
        if (this.options.snapshotDirectory) {
            await rimraf(this.options.snapshotDirectory)
            await fspromises.mkdir(this.options.snapshotDirectory, { recursive: true })
            if (this.options.csvPath) {
                this.csvWriter = createObjectCsvWriter({
                    header: autocompleteItemHeaders,
                    path: this.options.csvPath,
                })
            }
        }
    }
    public async writeDocument(document: EvaluationDocument): Promise<void> {
        if (!this.options.snapshotDirectory || document.items.length === 0) {
            return
        }
        await document.writeSnapshot(this.options.snapshotDirectory)
        await this.csvWriter?.writeRecords(document.items)
    }
}
