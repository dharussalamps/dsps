import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

const CSV_MIME_TYPES = ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];

export type PickedCsvFile = { name: string; content: string };

/** Opens the system file picker and reads the chosen file as text. Returns null if the user cancels. */
export async function pickCsvFile(): Promise<PickedCsvFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: CSV_MIME_TYPES, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const content = await new File(asset.uri).text();
  return { name: asset.name, content };
}
