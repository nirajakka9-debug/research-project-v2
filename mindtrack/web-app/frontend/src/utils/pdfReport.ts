import type { CheckinComparisonReport } from "../types/mindtrack";

function escapePdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(text: string, maxChars = 92): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function downloadCheckinReportPdf(report: CheckinComparisonReport): void {
  const rawLines: string[] = [
    "MINDTRACK PERSONAL BASELINE COMPARISON REPORT",
    "Non-Diagnostic Research Monitoring Summary",
    `Check-in ID: ${report.checkinId}`,
    `Participant User ID: ${report.userId}`,
    `Session Timestamp: ${new Date(report.sessionTimestamp).toLocaleString()}`,
    `Available Modalities: ${report.availableModalities.join(", ") || "None"}`,
    `Missing Modalities: ${report.missingModalities.join(", ") || "None"}`,
    `Stress Score: Not computed (experimental non-diagnostic tool)`,
    "",
    "HISTORICAL CONTEXT",
    `Total Check-ins: ${report.historicalContext.totalCheckinCount} (Prior: ${report.historicalContext.priorCheckinCount})`,
    `Days Since Previous Check-in: ${report.historicalContext.daysSincePreviousCheckin ?? "N/A"}`,
    `Facial Baseline Calibrated: ${report.historicalContext.faceBaselineCalibrated ? "Yes" : "No"}`,
    `Voice Baseline Established: ${report.historicalContext.voiceBaselineEstablished ? "Yes" : "No"}`,
    "",
    "RECORDING QUALITY",
    report.recordingQuality.face
      ? `Face: Quality ${report.recordingQuality.face.qualityScore ?? "N/A"}/100, Coverage ${
          report.recordingQuality.face.detectionCoverage !== null
            ? (report.recordingQuality.face.detectionCoverage * 100).toFixed(1) + "%"
            : "N/A"
        }, Reliable: ${report.recordingQuality.face.isReliable ? "Yes" : "No"}`
      : "Face: Omitted (null)",
    report.recordingQuality.voice
      ? `Voice: Quality ${report.recordingQuality.voice.qualityScore?.toFixed(2) ?? "N/A"}/1.00, Duration ${report.recordingQuality.voice.durationSec ?? "N/A"}s, Rate ${report.recordingQuality.voice.sampleRate ?? "N/A"} Hz`
      : "Voice: Omitted (null)",
    "",
    "FEATURE COMPARISONS VS PERSONAL BASELINE",
  ];

  for (const row of report.comparisons) {
    const cur = row.currentValue !== null ? row.currentValue.toFixed(3) : "Unavailable";
    const base =
      row.baselineMean !== null
        ? `${row.baselineMean.toFixed(3)} +/- ${(row.baselineStd ?? 0).toFixed(3)} (n=${row.baselineCount})`
        : "N/A";
    const diff = row.absoluteDifference !== null ? row.absoluteDifference.toFixed(3) : "N/A";
    const pct = row.relativeChangePct !== null ? `${row.relativeChangePct.toFixed(1)}%` : "N/A";
    const z = row.standardizedZ !== null ? `${row.standardizedZ >= 0 ? "+" : ""}${row.standardizedZ.toFixed(2)}` : "N/A";
    rawLines.push(`[${row.modality}] ${row.label} (${row.units})`);
    rawLines.push(`  Current: ${cur} | Baseline: ${base} | Diff: ${diff} (${pct}) | Z: ${z}`);
    rawLines.push(`  Note: ${row.interpretation}`);
  }

  rawLines.push("");
  rawLines.push("LIMITATIONS & NOTICE");
  for (const lim of report.limitations) {
    rawLines.push(`* ${lim}`);
  }

  const wrapped: string[] = [];
  for (const line of rawLines) {
    if (!line) {
      wrapped.push("");
    } else {
      wrapped.push(...wrapLine(line, 90));
    }
  }

  // Paginate ~50 lines per page (Letter 612 x 792)
  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(["MindTrack Report"]);

  const objects: string[] = [];
  const addObj = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const fontObjId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjIds: number[] = [];

  for (const pageLines of pages) {
    let stream = "BT\n/F1 9 Tf\n13 TL\n46 746 Td\n";
    for (const line of pageLines) {
      stream += `(${escapePdfText(line)}) Tj T*\n`;
    }
    stream += "ET";
    const streamObjId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjId = addObj(
      `<< /Type /Page /Parent PAGES_PLACEHOLDER 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R >> >> /Contents ${streamObjId} 0 R >>`,
    );
    pageObjIds.push(pageObjId);
  }

  const pagesObjId = addObj(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>`,
  );
  for (const pid of pageObjIds) {
    objects[pid - 1] = objects[pid - 1].replace("PAGES_PLACEHOLDER", String(pagesObjId));
  }
  const catalogObjId = addObj(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mindtrack-report-${report.checkinId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
