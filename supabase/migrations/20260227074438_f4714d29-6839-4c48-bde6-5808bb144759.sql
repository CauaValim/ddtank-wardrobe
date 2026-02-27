
-- Allow anyone to upload images to item-images bucket
CREATE POLICY "Anyone can upload item images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'item-images');

-- Allow anyone to update/overwrite item images
CREATE POLICY "Anyone can update item images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'item-images');

-- Allow anyone to read item images
CREATE POLICY "Anyone can read item images"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-images');

-- Allow anyone to delete item images
CREATE POLICY "Anyone can delete item images"
ON storage.objects FOR DELETE
USING (bucket_id = 'item-images');
