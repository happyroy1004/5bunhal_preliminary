export async function pickFolder() {
  try {
    const handle = await window.showDirectoryPicker();
    localStorage.setItem("userFolder", await handle.name);
    return handle;
  } catch (err) {
    console.error(err);
  }
}

export async function saveJSON(handle, filename, data) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const stream = await fileHandle.createWritable();
  await stream.write(JSON.stringify(data, null, 2));
  await stream.close();
}
