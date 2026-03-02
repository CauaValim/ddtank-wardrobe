
INSERT INTO public.items (id, name, type)
VALUES
  (12232, 'Alma do Dragão Chiyan', 82),
  (12234, 'Pérola do Espírito do Vento', 82),
  (12235, 'Essência da terra', 82),
  (12233, 'Esfera de gelo', 82),
  (12291, 'Cristal de Luz', 82),
  (12292, 'Cristal da escuridão', 82),
  (123650, 'Emblema Misterioso - Amarelo', 82),
  (123651, 'Emblema Misterioso - Vermelho', 82),
  (12231, 'Areia de poeira estelar', 82),
  (12225, 'Cobre Vermelho', 82),
  (12228, 'Ouro Roxo', 82),
  (12227, 'Prata', 82),
  (12226, 'Ferro Preto', 82),
  (12229, 'Cristal colorido', 82),
  (12230, 'Pedra extraterrestre', 82)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type;
