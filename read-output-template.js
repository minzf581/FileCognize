const XLSX = require('xlsx');
const fs = require('fs');

try {
  console.log('📋 读取output.xlsx模板文件...');
  
  if (!fs.existsSync('output.xlsx')) {
    console.error('❌ output.xlsx文件不存在');
    process.exit(1);
  }
  
  const workbook = XLSX.readFile('output.xlsx');
  console.log('📊 工作表名称:', workbook.SheetNames);
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log('📐 工作表范围:', worksheet['!ref']);
  
  // 读取所有单元格内容
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  console.log('📏 范围详情: 从第' + (range.s.r + 1) + '行第' + (range.s.c + 1) + '列 到 第' + (range.e.r + 1) + '行第' + (range.e.c + 1) + '列');
  
  console.log('\n📋 模板内容:');
  for (let R = range.s.r; R <= Math.min(range.e.r, 25); ++R) {
    let row = [];
    let hasContent = false;
    
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_address = XLSX.utils.encode_cell({c: C, r: R});
      const cell = worksheet[cell_address];
      const value = cell ? cell.v : '';
      
      if (value !== '') hasContent = true;
      
      // 显示列字母
      const colLetter = String.fromCharCode(65 + C);
      row.push(`${colLetter}: "${value}"`);
    }
    
    if (hasContent) {
      console.log(`第${R+1}行:`, row.join(', '));
    }
  }
  
  // 检查特定单元格
  console.log('\n🔍 检查关键单元格:');
  const checkCells = ['A1', 'A12', 'B12', 'G12', 'A13', 'B13', 'G13'];
  checkCells.forEach(cellAddr => {
    const cell = worksheet[cellAddr];
    console.log(`${cellAddr}: "${cell ? cell.v : '(空)'}" ${cell ? `(类型: ${cell.t})` : ''}`);
  });
  
  // 检查合并单元格
  if (worksheet['!merges']) {
    console.log('\n🔗 合并单元格:');
    worksheet['!merges'].forEach((merge, index) => {
      const startCell = XLSX.utils.encode_cell(merge.s);
      const endCell = XLSX.utils.encode_cell(merge.e);
      console.log(`合并${index + 1}: ${startCell}:${endCell}`);
    });
  }
  
  // 检查列宽
  if (worksheet['!cols']) {
    console.log('\n📏 列宽设置:');
    worksheet['!cols'].forEach((col, index) => {
      if (col) {
        const colLetter = String.fromCharCode(65 + index);
        console.log(`列${colLetter}: 宽度=${col.width || col.wpx || '默认'}`);
      }
    });
  }
  
  console.log('\n✅ 模板分析完成');
  
} catch (error) {
  console.error('❌ 读取模板失败:', error.message);
} 