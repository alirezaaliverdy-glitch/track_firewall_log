/**
 * PrivacyNotice - rendered near the CSV uploader.
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
      Uploaded logs are processed by this Firewall Log Analyzer instance. AI analysis only receives selected security context, including event summaries, when AI features are used.
    </p>
  );
}
