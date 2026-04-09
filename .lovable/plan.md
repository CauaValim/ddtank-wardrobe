

## Plano: Restaurar itens que perderam categoria

### Problema
Uma importação `.xlsx` feita antes da correção "insert only" sobrescreveu o campo `type` de centenas de itens manualmente categorizados, revertendo-os aos tipos originais da planilha.

### Abordagem
Recuperar as listas originais de IDs do histórico de conversa e executar UPDATEs no banco para restaurar o `type` correto de cada grupo.

### Etapas

1. **Recuperar listas completas de IDs** do histórico de conversa para cada categoria afetada:
   - Pérolas (203): IDs 313615, 313613, 313622, 313517
   - Fragmentos (202): recuperar lista do histórico
   - Itens de Up (20): recuperar lista completa (~150+ IDs)
   - Ilustração de Montaria (201): recuperar lista dos 82 IDs
   - Selo Contra-Marca (92): recuperar lista dos 47 IDs
   - Pets Elementais (85): recuperar lista dos 30 IDs

2. **Executar UPDATE em lote** via migration para cada categoria:
   ```sql
   UPDATE items SET type = 203 WHERE id IN (313615, 313613, 313622, 313517);
   UPDATE items SET type = 202 WHERE id IN (...);
   -- etc.
   ```

3. **Verificar** contagens finais para confirmar restauração.

### Detalhes técnicos
- Usarei o tool de insert/update do Supabase (não migration, pois é alteração de dados)
- As correções de nomes (313511→"Pérola Mágica", etc.) também serão restauradas
- A proteção "insert only" já implementada evitará que isso ocorra novamente em futuras importações

