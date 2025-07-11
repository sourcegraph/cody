export const MOCK_LONG_RESPONSE = `I'll help you implement a complex feature with multiple code examples. Here's a comprehensive solution:

## 1. First, let's create the main component:

\`\`\`typescript
import React, { useState, useEffect, useCallback } from 'react'
import { ApiClient } from './api/client'
import { DataProcessor } from './utils/processor'
import { Logger } from './utils/logger'

interface FeatureProps {
    config: FeatureConfig
    onSuccess: (result: ProcessedData) => void
    onError: (error: Error) => void
}

export const ComplexFeature: React.FC<FeatureProps> = ({
    config,
    onSuccess,
    onError
}) => {
    const [data, setData] = useState<RawData[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)

    const processData = useCallback(async () => {
        setIsProcessing(true)
        setProgress(0)

        try {
            const processor = new DataProcessor(config)
            const result = await processor.process(data, (progress) => {
                setProgress(progress)
            })

            onSuccess(result)
        } catch (error) {
            Logger.error('Processing failed:', error)
            onError(error as Error)
        } finally {
            setIsProcessing(false)
        }
    }, [data, config, onSuccess, onError])

    return (
        <div className="complex-feature">
            <h2>Complex Feature Implementation</h2>
            {isProcessing && (
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: \`\${progress}%\` }}
                    />
                </div>
            )}
            <button
                onClick={processData}
                disabled={isProcessing}
            >
                {isProcessing ? 'Processing...' : 'Start Processing'}
            </button>
        </div>
    )
}
\`\`\`

## 2. Now let's implement the API client:

\`\`\`typescript
export class ApiClient {
    private baseUrl: string
    private headers: Record<string, string>

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${apiKey}\`,
        }
    }

    async fetchData(endpoint: string, params?: Record<string, any>): Promise<any> {
        const url = new URL(endpoint, this.baseUrl)

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, String(value))
            })
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: this.headers,
        })

        if (!response.ok) {
            throw new Error(\`API request failed: \${response.statusText}\`)
        }

        return response.json()
    }

    async postData(endpoint: string, data: any): Promise<any> {
        const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(data),
        })

        if (!response.ok) {
            throw new Error(\`API request failed: \${response.statusText}\`)
        }

        return response.json()
    }
}
\`\`\`

## 3. Data processor implementation:

\`\`\`typescript
export class DataProcessor {
    private config: FeatureConfig
    private logger: Logger

    constructor(config: FeatureConfig) {
        this.config = config
        this.logger = new Logger('DataProcessor')
    }

    async process(
        data: RawData[],
        onProgress?: (progress: number) => void
    ): Promise<ProcessedData> {
        const total = data.length
        const processed: ProcessedItem[] = []

        for (let i = 0; i < data.length; i++) {
            const item = data[i]

            try {
                const processedItem = await this.processItem(item)
                processed.push(processedItem)

                // Update progress
                const progress = Math.round(((i + 1) / total) * 100)
                onProgress?.(progress)

                this.logger.debug(\`Processed item \${i + 1} of \${total}\`)

            } catch (error) {
                this.logger.error(\`Failed to process item \${i}\`, error)
                throw error
            }
        }

        return {
            items: processed,
            totalCount: processed.length,
            processedAt: new Date().toISOString(),
        }
    }

    private async processItem(item: RawData): Promise<ProcessedItem> {
        // Simulate complex processing
        await this.delay(100)

        return {
            id: item.id,
            value: item.value * this.config.multiplier,
            normalized: this.normalizeValue(item.value),
            metadata: {
                processedAt: Date.now(),
                source: item.source,
            },
        }
    }

    private normalizeValue(value: number): number {
        const min = this.config.normalization.min
        const max = this.config.normalization.max
        return (value - min) / (max - min)
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}
\`\`\`

## 4. Logger utility:

\`\`\`typescript
export class Logger {
    private context: string

    constructor(context: string) {
        this.context = context
    }

    debug(message: string, ...args: any[]): void {
        console.debug(\`[\${this.context}] \${message}\`, ...args)
    }

    info(message: string, ...args: any[]): void {
        console.info(\`[\${this.context}] \${message}\`, ...args)
    }

    warn(message: string, ...args: any[]): void {
        console.warn(\`[\${this.context}] \${message}\`, ...args)
    }

    error(message: string, ...args: any[]): void {
        console.error(\`[\${this.context}] \${message}\`, ...args)
    }
}
\`\`\`

## 5. Type definitions:

\`\`\`typescript
interface FeatureConfig {
    multiplier: number
    normalization: {
        min: number
        max: number
    }
    apiEndpoint: string
    batchSize: number
}

interface RawData {
    id: string
    value: number
    source: string
}

interface ProcessedItem {
    id: string
    value: number
    normalized: number
    metadata: {
        processedAt: number
        source: string
    }
}

interface ProcessedData {
    items: ProcessedItem[]
    totalCount: number
    processedAt: string
}
\`\`\`

## 6. Usage example:

\`\`\`typescript
import { ComplexFeature } from './ComplexFeature'

const App: React.FC = () => {
    const config: FeatureConfig = {
        multiplier: 2.5,
        normalization: { min: 0, max: 100 },
        apiEndpoint: 'https://api.example.com',
        batchSize: 10,
    }

    const handleSuccess = (result: ProcessedData) => {
        console.log('Processing completed:', result)
    }

    const handleError = (error: Error) => {
        console.error('Processing failed:', error)
    }

    return (
        <div>
            <ComplexFeature
                config={config}
                onSuccess={handleSuccess}
                onError={handleError}
            />
        </div>
    )
}
\`\`\`

This implementation provides a robust, scalable solution with proper error handling, progress tracking, and clean separation of concerns. Each component has a specific responsibility and can be easily tested and maintained.`
