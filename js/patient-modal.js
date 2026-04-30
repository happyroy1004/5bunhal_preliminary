// ──────────────────────────────────────────
// 환자 등록 모달
// ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {Function} opts.getDirHandle  - () => dirHandle
 * @param {Function} opts.getPatients   - () => patientsData 배열
 * @param {Function} opts.savePatients  - () => Promise<void>
 * @param {Function} opts.onSaved       - 저장 완료 후 콜백 ()=>void
 * @param {Function} opts.showAlert     - (msg) => void
 */
export function initAddPatientModal({ getDirHandle, getPatients, savePatients, onSaved, showAlert }) {
  const modal      = document.getElementById("addPatientModal");
  const form       = document.getElementById("addPatientForm");
  const openBtn    = document.getElementById("addPatientBtn");
  const closeBtn   = document.getElementById("closePatientModalBtn");
  const cancelBtn  = document.getElementById("cancelPatientBtn");

  const _close = () => modal.classList.remove("show");
  closeBtn.onclick  = _close;
  cancelBtn.onclick = _close;

  openBtn.onclick = () => {
    document.getElementById("initialVisitDate").value = new Date().toISOString().split("T")[0];
    modal.classList.add("show");
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const chart = document.getElementById("chartNumber").value.trim();
    const name  = document.getElementById("patientName").value.trim();
    const newPatient = {
      id:               Date.now().toString(),
      chartNumber:      chart,
      name,
      initialVisitDate: document.getElementById("initialVisitDate").value,
      tags:             document.getElementById("patientTags").value
                          .split(",").map(t => t.trim()).filter(Boolean),
      notes:   "",
      records: [],
    };
    try {
      await getDirHandle().getDirectoryHandle(
        `[${chart}]_${name}_임상사진`, { create: true }
      );
      getPatients().push(newPatient);
      await savePatients();
      _close();
      form.reset();
      onSaved();
      showAlert(`[${name}] 환자 등록 완료!`);
    } catch {
      showAlert("폴더 생성 중 오류가 발생했습니다.");
    }
  };
}

// ──────────────────────────────────────────
// 환자 정보 수정 모달
// ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {Function} opts.getPatient    - () => activePatient
 * @param {Function} opts.savePatients  - () => Promise<void>
 * @param {Function} opts.onSaved       - 저장 완료 후 콜백 ()=>void
 * @param {Function} opts.showAlert     - (msg) => void
 */
export function initEditPatientModal({ getPatient, savePatients, onSaved, showAlert }) {
  const modal     = document.getElementById("editPatientModal");
  const form      = document.getElementById("editPatientForm");
  const openBtn   = document.getElementById("editPatientBtn");
  const closeBtn  = document.getElementById("closeEditPatientBtn");
  const cancelBtn = document.getElementById("cancelEditPatientBtn");

  const _close = () => modal.classList.remove("show");
  closeBtn.onclick  = _close;
  cancelBtn.onclick = _close;

  openBtn.onclick = () => {
    const p = getPatient();
    document.getElementById("editPatientName").value       = p.name;
    document.getElementById("editChartNumber").value       = p.chartNumber;
    document.getElementById("editInitialVisitDate").value  = p.initialVisitDate || "";
    document.getElementById("editPatientTags").value       = (p.tags || []).join(", ");
    modal.classList.add("show");
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const p = getPatient();
    p.name              = document.getElementById("editPatientName").value.trim();
    p.initialVisitDate  = document.getElementById("editInitialVisitDate").value;
    p.tags              = document.getElementById("editPatientTags").value
                            .split(",").map(t => t.trim()).filter(Boolean);
    await savePatients();
    _close();
    onSaved();
    showAlert("환자 정보 수정 완료.");
  };
}