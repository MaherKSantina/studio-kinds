import type { CheckResult } from "../check";

/** The check's verdict, above the preview: valid or the problems, then what could not be checked. */
export default function Problems({ result }: { result: CheckResult }) {
  const n = result.problems.length;
  return (
    <div className={`problems ${result.ok ? "ok" : "bad"}`}>
      <div className="summary">
        <b>{result.ok ? "Valid" : `${n} problem${n === 1 ? "" : "s"}`}</b>
        {result.summary && <span className="muted"> · {result.summary}</span>}
      </div>
      {n > 0 && (
        <ul>
          {result.problems.map((p, i) => (
            <li key={i}>
              {p.line !== undefined && <code>line {p.line}{p.column !== undefined ? `:${p.column}` : ""}</code>}{" "}
              {p.message}
            </li>
          ))}
        </ul>
      )}
      {result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note, i) => <li key={i}>{note}</li>)}
        </ul>
      )}
    </div>
  );
}
