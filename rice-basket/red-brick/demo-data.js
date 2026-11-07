function seedDemoSessions(storage) {
  const examples = [
    {
      slotName: '1반 (예시)', teamCount: 4, curIdx: 3,
      sales: [
        [0, 0, 1, 2], [0, 1, 1, 3], [0, 2, 1, 2], [0, 3, 1, 4],
        [0, 0, 1, 3], [0, 1, 1, 2], [0, 2, 1, 4], [0, 3, 1, 2], [0, 1, 1, 1],
        [1, 0, 1, 2], [1, 1, 1, 2], [1, 2, 1, 3], [1, 3, 1, 2], [1, 2, 1, 1],
        [2, 3, 1, 4],
      ],
    },
    {
      slotName: '2반 (예시)', teamCount: 5, curIdx: 5,
      sales: [
        [0, 0, 2, 3], [0, 1, 2, 5], [0, 2, 2, 4], [0, 3, 2, 6], [0, 4, 2, 3], [0, 4, 1, 1],
        [1, 0, 1, 2], [1, 1, 1, 1], [1, 2, 1, 3], [1, 3, 1, 2], [1, 4, 2, 2],
        [2, 3, 1, 3],
        [3, 0, 1, 2], [3, 1, 1, 2], [3, 2, 1, 1], [3, 3, 1, 2], [3, 4, 1, 3],
        [4, 4, 5, 1],
        [5, 0, 1, 4], [5, 1, 1, 6], [5, 2, 1, 5],
      ],
    },
    {
      slotName: '3반 (예시)', teamCount: 6, curIdx: 0,
      sales: [[0, 0, 1, 1], [0, 1, 1, 2], [0, 2, 1, 2], [0, 3, 1, 3], [0, 4, 1, 2], [0, 5, 1, 1]],
    },
  ];

  for (const example of examples) {
    const key = 'auction_class_save_' + example.slotName;
    if (storage.getItem(key) !== null) continue;
    const stock = calcRecommendedStock(example.teamCount);
    const teams = Array.from({ length: example.teamCount }, (_, index) => ({ name: `${index + 1}팀`, money: 20, items: {} }));
    const materials = MATERIAL_DEFAULTS.map(material => ({ ...material, stock: stock[material.id], soldCount: 0 }));
    const logs = [];
    const saleHistory = example.sales.map(([materialIndex, teamIndex, qty, price], index) => {
      const material = materials[materialIndex], team = teams[teamIndex];
      team.money -= price;
      team.items[material.id] = (team.items[material.id] || 0) + qty;
      material.soldCount += qty;
      logs.unshift({ ts: `10:${String(index).padStart(2, '0')}`, text: `🏷 [낙찰] ${team.name} ← ${material.name} ${qty}장 (${price}어스)`, isWin: true });
      return { matId: material.id, teamName: team.name, qty, price };
    });
    storage.setItem(key, JSON.stringify({
      slotName: example.slotName, teams, materials, curIdx: example.curIdx, curBid: 1,
      logs, saleHistory, savedAt: '2026-11-05T10:30:00+09:00',
    }));
  }
}
