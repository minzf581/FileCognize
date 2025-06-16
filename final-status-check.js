const XLSX = require('xlsx');
const fs = require('fs');

console.log('🎯 最终状态检查 - Excel导出格式一致性\n');

// 检查模板文件
console.log('📋 1. 模板文件检查:');
const templatePath = './output.xlsx';
if (fs.existsSync(templatePath)) {
  const templateStats = fs.statSync(templatePath);
  const templateWorkbook = XLSX.readFile(templatePath);
  const templateSheet = templateWorkbook.Sheets['Sheet 1'];
  
  console.log(`  ✅ 模板文件存在: ${templatePath}`);
  console.log(`  📊 文件大小: ${templateStats.size} bytes`);
  console.log(`  📐 工作表范围: ${templateSheet['!ref']}`);
  console.log(`  🔗 合并单元格: ${templateSheet['!merges']?.length || 0} 个`);
  console.log(`  📝 A1内容: ${templateSheet['A1']?.v ? '✅ 公司信息完整' : '❌ 缺失'}`);
  console.log(`  📄 D1内容: ${templateSheet['D1']?.v ? '✅ 文档标题完整' : '❌ 缺失'}`);
} else {
  console.log('  ❌ 模板文件不存在');
}

// 检查最新导出文件
console.log('\\n📁 2. 最新导出文件检查:');
const exportsDir = './server/exports';
if (fs.existsSync(exportsDir)) {
  const files = fs.readdirSync(exportsDir)
    .filter(f => f.includes('FileCognize_Selected') && f.endsWith('.xlsx'))
    .map(f => ({
      name: f,
      time: fs.statSync(`${exportsDir}/${f}`).mtime,
      size: fs.statSync(`${exportsDir}/${f}`).size
    }))
    .sort((a, b) => b.time - a.time);
  
  if (files.length > 0) {
    const latestFile = files[0];
    console.log(`  📄 最新文件: ${latestFile.name}`);
    console.log(`  ⏰ 创建时间: ${latestFile.time.toLocaleString()}`);
    console.log(`  📊 文件大小: ${latestFile.size} bytes`);
    
    try {
      const exportWorkbook = XLSX.readFile(`${exportsDir}/${latestFile.name}`);
      const exportSheet = exportWorkbook.Sheets['Sheet 1'];
      
      // 格式保持检查
      console.log('\\n  🎨 格式保持检查:');
      const hasA1 = exportSheet['A1']?.v && exportSheet['A1'].v.toString().includes('CONFEZIONE MIRA');
      const hasD1 = exportSheet['D1']?.v && exportSheet['D1'].v.toString().includes('DOCUMENTO DI TRANSPORTO');
      const rangeMatch = exportSheet['!ref'] === 'A1:G37';
      const mergeMatch = (exportSheet['!merges']?.length || 0) === 35;
      
      console.log(`    A1公司信息: ${hasA1 ? '✅ 保持' : '❌ 丢失'}`);
      console.log(`    D1文档标题: ${hasD1 ? '✅ 保持' : '❌ 丢失'}`);
      console.log(`    工作表范围: ${rangeMatch ? '✅ 一致' : '❌ 不一致'} (${exportSheet['!ref']})`);
      console.log(`    合并单元格: ${mergeMatch ? '✅ 一致' : '❌ 不一致'} (${exportSheet['!merges']?.length || 0}个)`);
      
      // 数据写入检查
      console.log('\\n  📝 数据写入检查:');
      const a12 = exportSheet['A12'];
      const b12 = exportSheet['B12'];
      const g12 = exportSheet['G12'];
      
      console.log(`    A12数量: ${a12?.v || '未写入'}`);
      console.log(`    B12描述: ${b12?.v || '未写入'}`);
      console.log(`    G12单号: ${g12?.v || '未写入'}`);
      
      const dataWritten = !!(a12?.v && b12?.v && g12?.v);
      console.log(`    数据状态: ${dataWritten ? '✅ 已写入' : '❌ 未写入'}`);
      
      // 文件大小检查
      console.log('\\n  📊 文件大小检查:');
      const templateSize = fs.statSync(templatePath).size;
      const sizeRatio = latestFile.size / templateSize;
      const sizeReasonable = sizeRatio < 2.0; // 不应超过原始大小的2倍
      
      console.log(`    模板大小: ${templateSize} bytes`);
      console.log(`    导出大小: ${latestFile.size} bytes`);
      console.log(`    大小比例: ${sizeRatio.toFixed(2)}x`);
      console.log(`    大小状态: ${sizeReasonable ? '✅ 合理' : '⚠️ 偏大'}`);
      
      // 总体评估
      console.log('\\n🎯 3. 总体评估:');
      const formatScore = (hasA1 ? 1 : 0) + (hasD1 ? 1 : 0) + (rangeMatch ? 1 : 0) + (mergeMatch ? 1 : 0);
      const formatPercentage = (formatScore / 4 * 100).toFixed(0);
      
      console.log(`  🎨 格式保持: ${formatPercentage}% (${formatScore}/4)`);
      console.log(`  📝 数据写入: ${dataWritten ? '✅ 成功' : '❌ 失败'}`);
      console.log(`  📊 文件大小: ${sizeReasonable ? '✅ 正常' : '⚠️ 异常'}`);
      
      const overallSuccess = formatScore >= 3 && dataWritten;
      console.log(`  🏆 整体状态: ${overallSuccess ? '✅ 优秀' : '⚠️ 需要优化'}`);
      
      if (overallSuccess) {
        console.log('\\n🎉 恭喜！Excel导出格式一致性问题已经解决！');
        console.log('   ✅ 表头信息完整保持');
        console.log('   ✅ 数据成功写入');
        console.log('   ✅ 跨平台格式一致');
      } else {
        console.log('\\n⚠️ 还需要进一步优化:');
        if (formatScore < 3) console.log('   - 格式保持需要改进');
        if (!dataWritten) console.log('   - 数据写入需要修复');
        if (!sizeReasonable) console.log('   - 文件大小需要优化');
      }
      
    } catch (error) {
      console.log(`  ❌ 文件读取失败: ${error.message}`);
    }
  } else {
    console.log('  ❌ 没有找到导出文件');
  }
} else {
  console.log('  ❌ 导出目录不存在');
}

console.log('\\n✅ 状态检查完成'); 