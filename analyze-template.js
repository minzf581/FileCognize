const XLSX = require('xlsx');
const fs = require('fs');

try {
  console.log('📋 分析output.xlsx模板文件...');
  
  if (!fs.existsSync('output.xlsx')) {
    console.error('❌ output.xlsx文件不存在');
    process.exit(1);
  }
  
  const workbook = XLSX.readFile('output.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log('📊 工作表名称:', sheetName);
  console.log('📐 工作表范围:', worksheet['!ref']);
  
  // 检查关键单元格
  const checkCells = ['A1', 'A11', 'B11', 'G11', 'A12', 'B12', 'G12'];
  console.log('\n🔍 关键单元格内容:');
  checkCells.forEach(cellAddr => {
    const cell = worksheet[cellAddr];
    console.log(`${cellAddr}: "${cell ? cell.v : '(空)'}"`);
  });
  
  // 检查合并单元格
  if (worksheet['!merges']) {
    console.log(`\n🔗 合并单元格数量: ${worksheet['!merges'].length}`);
    console.log('前5个合并单元格:');
    worksheet['!merges'].slice(0, 5).forEach((merge, index) => {
      const startCell = XLSX.utils.encode_cell(merge.s);
      const endCell = XLSX.utils.encode_cell(merge.e);
      console.log(`  ${index + 1}: ${startCell}:${endCell}`);
    });
  }
  
  // 检查数据填入区域 (第11-15行)
  console.log('\n📝 数据填入区域 (第11-15行):');
  for (let row = 10; row <= 14; row++) {
    const cells = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(col => {
      const cellAddr = col + (row + 1);
      const cell = worksheet[cellAddr];
      return `${col}: "${cell ? cell.v : ''}"`;
    });
    console.log(`第${row + 1}行: ${cells.join(', ')}`);
  }
  
  console.log('\n✅ 模板分析完成');
  
} catch (error) {
  console.error('❌ 分析模板失败:', error.message);
} 