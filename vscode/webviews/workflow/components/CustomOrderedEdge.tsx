import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type React from 'react'

export interface Edge {
    id: string
    source: string
    target: string
}

// Extend EdgeProps to include our data field
export type OrderedEdgeProps = EdgeProps & {
    data?: {
        orderNumber: number
    }
}

export const CustomOrderedEdge: React.FC<OrderedEdgeProps> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
}) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    })

    // Only render label if we have an order number
    const orderNumber = data?.orderNumber

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
            {typeof orderNumber === 'number' && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            padding: '4px 8px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--vscode-badge-background)',
                            color: 'var(--vscode-badge-foreground)',
                            fontSize: 12,
                            fontWeight: 'bold',
                            pointerEvents: 'all',
                        }}
                    >
                        {orderNumber}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    )
}

export const edgeTypes: { [key: string]: React.FC<any> } = {
    'ordered-edge': CustomOrderedEdge,
}
