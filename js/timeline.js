// ──────────────────────────────────────────
// 날짜 간격 계산
// ──────────────────────────────────────────

function _getInterval(d1Str, d2Str) {
  const d1 = new Date(d1Str), d2 = new Date(d2Str);
  const days = Math.floor((d2 - d1) / 86400000);
  if (days <= 0) return "당일";
  if (days < 7)  return `${days}D`;
  if (days < 30) return `${Math.floor(days / 7)}W`;
  let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) m--;
  if (m <= 0) return `${Math.floor(days / 7)}W`;
  const y = Math.floor(m / 12);
  return (y > 0 ? `${y}Y ` : "") + (m % 12 > 0 ? `${m % 12}M` : "");
}

// ──────────────────────────────────────────
// 타임라인 렌더링
// ──────────────────────────────────────────

/**
 * 타임라인 바를 렌더링하고 노드 클릭 핸들러를 연결합니다.
 *
 * @param {object} opts
 * @param {object}   opts.patient           - activePatient
 * @param {Array}    opts.selectedRecords   - 현재 선택된 기록 배열 (참조)
 * @param {boolean}  opts.isCompareMode
 * @param {Function} opts.onSelect          - 선택 변경 후 호출되는 콜백 ()=>void
 */
export function renderTimeline({ patient, selectedRecords, isCompareMode, onSelect }) {
  const bar = document.getElementById("timelineBar");
  bar.innerHTML = "";

  if (!patient.records?.length) {
    bar.innerHTML = "<div style='color:#64748B;'>새 기록을 추가해주세요.</div>";
    return;
  }

  patient.records.sort((a, b) => new Date(a.date) - new Date(b.date));

  // 초진 노드 (기록 없는 경우)
  let hasInitNode = false;
  if (patient.initialVisitDate && patient.records[0].date > patient.initialVisitDate) {
    const el = document.createElement("div");
    el.className = "timeline-item";
    el.style.cssText = "opacity:0.7;cursor:default;";
    el.innerHTML = `
      <div class="timeline-date">${patient.initialVisitDate}</div>
      <div class="timeline-label">초진 (기록없음)</div>`;
    bar.appendChild(el);
    hasInitNode = true;
  }

  patient.records.forEach((record, idx) => {
    // 연결선
    if (idx > 0 || hasInitNode) {
      const prevDate = idx === 0 ? patient.initialVisitDate : patient.records[idx - 1].date;
      const connector = document.createElement("div");
      connector.className = "timeline-connector";
      connector.innerHTML = `<span class="interval-text">${_getInterval(prevDate, record.date)}</span>`;
      bar.appendChild(connector);
    }

    // 날짜 노드
    const node = document.createElement("div");
    node.className = "timeline-item";
    node.id = `timeline-node-${record.id}`;
    const isInitial = patient.initialVisitDate && record.date === patient.initialVisitDate;
    node.innerHTML = `
      <div class="timeline-date">${record.date}</div>
      <div class="timeline-label">${isInitial ? "초진" : "진료"}</div>`;

    node.onclick = () => {
      if (!isCompareMode) {
        selectedRecords.splice(0, selectedRecords.length, record);
      } else {
        const i = selectedRecords.findIndex(r => r.id === record.id);
        if (i > -1) {
          if (selectedRecords.length > 1) selectedRecords.splice(i, 1);
        } else {
          if (selectedRecords.length >= 2) selectedRecords.shift();
          selectedRecords.push(record);
          selectedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
      }
      onSelect();
    };

    bar.appendChild(node);
  });
}

/**
 * 선택 상태에 따라 타임라인 노드 스타일을 업데이트합니다.
 *
 * @param {Array}   selectedRecords
 * @param {boolean} isCompareMode
 */
export function updateTimelineUI(selectedRecords, isCompareMode) {
  document.querySelectorAll(".timeline-item").forEach(el => {
    el.classList.remove("active");
    el.style.borderColor = "var(--border-light)";
    el.style.background  = "#F8FAFC";
  });

  selectedRecords.forEach((record, idx) => {
    const el = document.getElementById(`timeline-node-${record.id}`);
    if (!el) return;
    el.classList.add("active");
    if (isCompareMode) {
      el.style.borderColor = idx === 0 ? "var(--btn-navy)" : "var(--btn-green)";
      el.style.background  = idx === 0 ? "#EFF6FF"         : "#F0FDF4";
    } else {
      el.style.borderColor = "var(--btn-navy)";
      el.style.background  = "#EFF6FF";
    }
  });
}