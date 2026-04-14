-- Restaurar tipos originais dos itens incorretamente movidos para 204

-- Chapéu (type 1): faixa 1xxx, 11000xxx, 12000xxx
UPDATE items SET type = 1 WHERE type = 204 AND id IN (1101, 11000005, 11000048, 11000169, 11000204, 11000218, 12000106, 12000155, 12000286, 12000324, 12000338);

-- Cabelo (type 3): faixa 3xxx, 13000xxx
UPDATE items SET type = 3 WHERE type = 204 AND id IN (3517, 3561, 3642, 3689, 3828, 3866, 3880, 13000095, 13000137, 13000151);

-- Face (type 4): faixa 4xxx, 56xxx
UPDATE items SET type = 4 WHERE type = 204 AND id IN (4539, 4641, 4716, 4732, 56020, 56039);

-- Roupa (type 5): faixa 5xxx, 61xxx, 52000xxx
UPDATE items SET type = 5 WHERE type = 204 AND id IN (5924, 5968, 61005, 61047, 61061, 52000051, 52000101, 52000242, 52000281, 52000295);

-- Rosto (type 6): faixa 6xxx (olhos, expressões)
UPDATE items SET type = 6 WHERE type = 204 AND id IN (6375, 6481, 6522, 6628, 6764, 6852, 6893, 6903, 6917, 15133, 15134, 710007);

-- Arma (type 7): faixa 7xxx, 72xxx
UPDATE items SET type = 7 WHERE type = 204 AND id IN (7226, 7255, 72261, 72262, 72263, 72264, 72551, 72552, 72553, 72554);

-- Itens Gerais (type 10): faixa 10xxx
UPDATE items SET type = 10 WHERE type = 204 AND id IN (10669, 10670, 10671, 10672, 10687, 10688);

-- Itens Bagunçados (type 11): faixa 11xxx, 12xxx (não-ilustração), 14xxx (baús/tampinhas), 1120xxx, 1122xxx, 1123xxx, 1124xxx, 1125xxx
UPDATE items SET type = 11 WHERE type = 204 AND id IN (11970, 12334, 12335, 12336, 12337, 12338, 12339, 12340, 12341, 12342, 12343, 12344, 14682, 14683, 14684, 14685, 14686, 14687, 1120661, 1122818, 1122819, 1122820, 1122821, 1123589, 1123862, 1123863, 1123864, 1123865, 1123866, 1124587, 1124588, 1124589, 1124843, 1124844, 1124845, 1124846, 1124847, 1125079, 1125080, 1125081, 1125082, 1125173, 1125174, 11660001, 11660002, 11660003, 11660004, 11660005, 11660006, 11660009, 11660010, 11660016);

-- Ternos (type 13): faixa 13xxx (pets/ternos), 140056
UPDATE items SET type = 13 WHERE type = 204 AND id IN (13775, 13782, 13784, 13787, 13788, 13789, 13790, 13962, 13963, 140056);

-- Asas (type 15): faixa 15xxx
UPDATE items SET type = 15 WHERE type = 204 AND id IN (15128);

-- Bolha de Fala (type 16): faixa 16xxx, 169xxx
UPDATE items SET type = 16 WHERE type = 204 AND id IN (16088, 169134);

-- Títulos (type 24): faixa 46xxx, 470xxx
UPDATE items SET type = 24 WHERE type = 204 AND id IN (46770, 46814, 46815, 46816, 46817, 46954, 46955, 470262, 470269, 470270, 470271, 470272, 470273, 470274);

-- Pets (type 35): faixa 35430xxx
UPDATE items SET type = 35 WHERE type = 204 AND id IN (35430101);

-- Bordas (type 43): faixa 1125751-1125752
UPDATE items SET type = 43 WHERE type = 204 AND id IN (1125751, 1125752);

-- Equip de Pet - Arma (type 50): faixa 30xxx, 140xxx, 150xxx, 160xxx
UPDATE items SET type = 50 WHERE type = 204 AND id IN (30133, 140102, 140113, 140114, 140133, 150102, 150113, 150114, 150133, 160102, 160110, 160113, 160114, 160133);

-- Equip de Pet - Chapéu (type 51): faixa 31xxx, 141xxx, 151xxx, 161xxx
UPDATE items SET type = 51 WHERE type = 204 AND id IN (31133, 141102, 141113, 141114, 141133, 151102, 151113, 151114, 151133, 161102, 161113, 161114, 161133);

-- Equip de Pet - Roupa (type 52): faixa 32xxx, 142xxx, 152xxx, 162xxx
UPDATE items SET type = 52 WHERE type = 204 AND id IN (32133, 142102, 142113, 142114, 142133, 152102, 152113, 152114, 152133, 162102, 162113, 162114, 162133);

-- Bordas (type 73): faixa 14668-14669
UPDATE items SET type = 73 WHERE type = 204 AND id IN (14668, 14669);

-- Ilustração de Montaria (type 201): faixa 12938, 12965, 14913
UPDATE items SET type = 201 WHERE type = 204 AND id IN (12938, 12965, 14913);

-- Os restantes que ficam como 204 (Cadastros Manuais) são:
-- -6700, -6600, -6500 (IDs negativos, itens novos)
-- 60003-60022 (Almas - sem tipo claro no banco)
-- 122xxx, 123xxx (Pacotes importados manualmente)
