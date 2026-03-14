INSERT INTO public.items (id, name, type) VALUES 
  (122695, 'Grande pacote livro de mão2', 200),
  (122673, 'Grande pacote livro de mão1', 200)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type;