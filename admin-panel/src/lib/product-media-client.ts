export type MediaUser = { uid: string; getIdToken: () => Promise<string> };
export type MediaUpload = { uid: string; key: string; file: File; assetId?: string };

export async function uploadProductImage(user: MediaUser, workflow: 'submission' | 'catalog', operation: MediaUpload): Promise<string> {
  if (user.uid !== operation.uid) throw new Error('Sign back into the uploading account to retry.');
  if (operation.assetId) return operation.assetId;
  const token = await user.getIdToken();
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const response = await fetch(base + '/api/v1/product-media/upload/' + workflow, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': operation.file.type,
      'Idempotency-Key': operation.key }, body: operation.file, cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Image upload failed. Retry the same image.'), { status: response.status });
  if (typeof result.image_asset_id !== 'string' || !/^[a-f0-9]{64}$/u.test(result.image_asset_id)) throw new Error('Image receipt unavailable. Retry the same image.');
  operation.assetId = result.image_asset_id;
  return result.image_asset_id;
}
