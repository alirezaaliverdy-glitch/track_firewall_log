import { useLogContext } from "@/context/LogContext";
import { CheckCircle, Circle } from "lucide-react";

const STEPS = [
  "Upload Logs",
  "Review Mapping",
  "Analyze Findings",
  "Explore Evidence",
  "Export",
];

export default function WorkflowGuide() {
  const { summary, mappingConfidence, selectedFindingId } = useLogContext();

  const isUploaded = summary.total > 0;
  const isMapped = mappingConfidence.score >= 50;
  const isAnalyzed = summary.total > 0;
  const isExploring = selectedFindingId !== null;

  let currentStepIndex = 0;
  if (isUploaded) currentStepIndex = 1;
  if (isMapped) currentStepIndex = 2;
  if (isAnalyzed) currentStepIndex = 3;
  if (isExploring) currentStepIndex = 3;

  return (
    <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
        {STEPS.map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isActive = index === currentStepIndex;

          return (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                  isActive
                    ? "border border-blue-700/60 bg-blue-950/50 text-blue-200"
                    : isComplete
                      ? "text-slate-300"
                      : "text-slate-500"
                }`}
              >
                {isComplete ? (
                  <CheckCircle className="h-3.5 w-3.5 text-blue-400" />
                ) : (
                  <Circle className={`h-3.5 w-3.5 ${isActive ? "text-blue-400" : "text-slate-600"}`} />
                )}
                <span className={isActive ? "font-semibold" : ""}>{step}</span>
              </div>
              {index < STEPS.length - 1 && (
                <span className="hidden text-slate-700 sm:inline">/</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
