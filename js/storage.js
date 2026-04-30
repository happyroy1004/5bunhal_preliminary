// ──────────────────────────────────────────
// IndexedDB: 폴더 핸들 영속 저장
// ──────────────────────────────────────────

function _getDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("DentalCaseDB", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("handles");
    req.onsuccess  = e => res(e.target.result);
    req.onerror    = e => rej(e.target.error);
  });
}

export async function saveDirectoryHandle(handle) {
  const db = await _getDB();
  db.transaction("handles", "readwrite").objectStore("handles").put(handle, "workspace");
}

export async function loadDirectoryHandle() {
  const db = await _getDB();
  return new Promise(res => {
    const req = db.transaction("handles", "readonly").objectStore("handles").get("workspace");
    req.onsuccess = () => res(req.result);
    req.onerror   = () => res(null);
  });
}

export async function verifyPermission(handle) {
  const opts = { mode: "readwrite" };
  if (await handle.queryPermission(opts)  === "granted") return true;
  if (await handle.requestPermission(opts) === "granted") return true;
  return false;
}

// ──────────────────────────────────────────
// patients_db.json 읽기 / 쓰기
// ──────────────────────────────────────────

/**
 * patients_db.json을 읽어 배열로 반환합니다.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array>}
 */
export async function loadPatients(dirHandle) {
  try {
    const fh  = await dirHandle.getFileHandle("patients_db.json", { create: true });
    const txt = await (await fh.getFile()).text();
    return txt ? JSON.parse(txt) : [];
  } catch {
    return [];
  }
}

/**
 * patients 배열을 patients_db.json에 저장합니다.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {Array} patients
 */
export async function savePatients(dirHandle, patients) {
  const fh = await dirHandle.getFileHandle("patients_db.json", { create: true });
  const w  = await fh.createWritable();
  await w.write(JSON.stringify(patients, null, 2));
  await w.close();
}

// ──────────────────────────────────────────
// 이미지 파일 저장
// ──────────────────────────────────────────

/**
 * 진료 날짜 폴더에 원본 이미지를 저장합니다.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {{ chartNumber: string, name: string }} patient
 * @param {string} dateStr
 * @param {File}   file
 */
export async function saveImageFile(dirHandle, patient, dateStr, file) {
  const pFolder = await dirHandle.getDirectoryHandle(
    `[${patient.chartNumber}]_${patient.name}_임상사진`, { create: true }
  );
  const dFolder = await pFolder.getDirectoryHandle(dateStr, { create: true });
  const nf = await dFolder.getFileHandle(file.name, { create: true });
  const w  = await nf.createWritable();
  await w.write(file);
  await w.close();
}

/**
 * 편집된 이미지 Blob을 저장하고 저장된 파일명을 반환합니다.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {{ chartNumber: string, name: string }} patient
 * @param {string} dateStr
 * @param {string} originalName
 * @param {Blob}   blob
 * @returns {Promise<string>} 저장된 편집 파일명
 */
export async function saveEditedImage(dirHandle, patient, dateStr, originalName, blob) {
  const pFolder    = await dirHandle.getDirectoryHandle(
    `[${patient.chartNumber}]_${patient.name}_임상사진`
  );
  const dFolder    = await pFolder.getDirectoryHandle(dateStr);
  const editedName = `edited_${Date.now()}_${originalName}`;
  const fh = await dFolder.getFileHandle(editedName, { create: true });
  const w  = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return editedName;
}

/**
 * 환자/날짜 폴더 핸들을 반환합니다.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {{ chartNumber: string, name: string }} patient
 * @param {string} dateStr
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function getDateFolder(dirHandle, patient, dateStr) {
  const pFolder = await dirHandle.getDirectoryHandle(
    `[${patient.chartNumber}]_${patient.name}_임상사진`
  );
  return pFolder.getDirectoryHandle(dateStr);
}