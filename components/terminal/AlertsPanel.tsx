"use client";

import React from "react";
import { Panel } from "../ui/Panel";

interface Alert {
    id: string;
    message: string;
    type: "info" | "warning" | "error";
    timestamp: number;
}

interface AlertsPanelProps {
    alerts: Alert[];
    onDismiss: (id: string) => void;
}

const typeColors = {
    info: "text-blue-400 border-l-blue-500",
    warning: "text-amber-400 border-l-amber-500",
    error: "text-red-400 border-l-red-500",
};

export function AlertsPanel({ alerts, onDismiss }: AlertsPanelProps) {
    return (
        <Panel title="Alerts" className="flex-1 min-h-0 flex flex-col" noPad>
            <div className="p-1 overflow-y-auto flex-1">
                {alerts.length === 0 ? (
                    <div className="text-[10px] text-[#4a5a6a] py-4 text-center">
                        No alerts
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {alerts.map((alert) => (
                            <div
                                key={alert.id}
                                className={`flex items-start gap-1 px-1.5 py-1 text-[10px] border-l-2 bg-[#0d1520] rounded-r ${typeColors[alert.type]}`}
                            >
                                <span className="flex-1">{alert.message}</span>
                                <button
                                    onClick={() => onDismiss(alert.id)}
                                    className="text-[#4a5a6a] hover:text-[#8899aa] flex-shrink-0"
                                >
                                    x
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Panel>
    );
}

export type { Alert };
