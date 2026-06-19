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
  const isMapped = mappingConfidence.score >= 50; // Arbitrary threshold for "mapped enough"
  const isAnalyzed = summary.total > 0; // Findings are analyzed if logs are uploaded
  const isExploring = selectedFindingId !== null;

  let currentStepIndex = 0;
  if (isUploaded) currentStepIndex = 1;
  if (isMapped) currentStepIndex = 2;
  if (isAnalyzed) currentStepIndex = 3; // After mapping and analysis
  if (isExploring) currentStepIndex = 3; // Same step as Analyze Findings, but more specific

  return (
    <div className="flex items-center justify-center space-x-2 text-sm text-zinc-500 mb-4">
      {STEPS.map((step, index) => (
        <>
          <div
            key={step}
            className={`flex items-center gap-1 ${index <= currentStepIndex ? "text-blue-400" : ""}`}
          >
            {index < currentStepIndex ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
            <span className={index === currentStepIndex ? "font-semibold" : ""}>
              {step}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <span className="text-zinc-600">→</span>
          )}
        </>
      ))}
    </div>
  );
}