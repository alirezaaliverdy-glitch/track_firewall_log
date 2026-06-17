/**
 * PrivacyNotice — rendered near the CSV uploader.
 *
 * This component can only exist as long as the app genuinely keeps all
 * processing client-side. If a server upload is ever added this must be removed.
 *
 * Security checklist (verified in this codebase):
 *   ✓ FileReader.readAsText — reads locally, no XHR/fetch
 *   ✓ PapaParse with no `download` option — parses in-memory
 *   ✓ No localStorage / sessionStorage writes of log data
 *   ✓ No eval / Function constructor usage
 *   ✓ No dangerouslySetInnerHTML
 *   ✓ Blob + URL.createObjectURL for exports — no server round-trip
 */
export default function PrivacyNotice() {
  return (
    <p className="mt-1 text-xs text-zinc-500 flex items-center gap-1" role="note">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
          clipRule="evenodd"
        />
      </svg>
      Logs are processed locally in your browser. No file is uploaded to any server.
    </p>
  );
}
