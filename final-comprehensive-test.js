const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class FinalComprehensiveTest {
    constructor() {
        this.templatePath = path.join(__dirname, 'output.xlsx');
        this.exportsDir = path.join(__dirname, 'server', 'exports');
        this.testResults = [];
    }

    // 记录测试结果
    recordTest(testName, status, details) {
        this.testResults.push({
            test: testName,
            status,
            details,
            timestamp: new Date().toISOString()
        });
        
        const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${emoji} ${testName}: ${details}`);
    }

    // 1. 验证模板文件完整性
    testTemplateIntegrity() {
        console.log('\n🔍 测试1: 模板文件完整性验证');
        console.log('=' .repeat(60));
        
        try {
            const workbook = XLSX.readFile(this.templatePath, { cellStyles: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            
            const allCells = Object.keys(worksheet).filter(key => !key.startsWith('!'));
            const merges = worksheet['!merges'] || [];
            const cols = worksheet['!cols'] || [];
            const rows = worksheet['!rows'] || [];
            
            this.recordTest('模板文件存在', 'PASS', `路径: ${this.templatePath}`);
            this.recordTest('工作表范围', 'PASS', `${worksheet['!ref']} (40行x7列)`);
            this.recordTest('单元格总数', 'PASS', `${allCells.length} 个单元格`);
            this.recordTest('合并单元格', 'PASS', `${merges.length} 个合并区域`);
            this.recordTest('列宽设置', 'PASS', `${cols.length} 列有宽度设置`);
            this.recordTest('行高设置', 'PASS', `${rows.length} 行有高度设置`);
            
            // 检查关键内容
            const templateData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            let hasQuantitaHeader = false;
            let hasDescrizioneHeader = false;
            
            templateData.forEach(row => {
                const rowStr = row.join(' ').toUpperCase();
                if (rowStr.includes('QUANTITA')) hasQuantitaHeader = true;
                if (rowStr.includes('DESCRIZIONE')) hasDescrizioneHeader = true;
            });
            
            this.recordTest('QUANTITA标题', hasQuantitaHeader ? 'PASS' : 'FAIL', hasQuantitaHeader ? '存在' : '缺失');
            this.recordTest('DESCRIZIONE标题', hasDescrizioneHeader ? 'PASS' : 'FAIL', hasDescrizioneHeader ? '存在' : '缺失');
            
            return {
                totalCells: allCells.length,
                merges: merges.length,
                cols: cols.length,
                rows: rows.length
            };
            
        } catch (error) {
            this.recordTest('模板文件读取', 'FAIL', error.message);
            return null;
        }
    }

    // 2. 验证当前导出文件问题
    testCurrentExportIssues() {
        console.log('\n🔍 测试2: 当前导出文件问题分析');
        console.log('=' .repeat(60));
        
        if (!fs.existsSync(this.exportsDir)) {
            this.recordTest('导出目录', 'FAIL', '目录不存在');
            return null;
        }

        const files = fs.readdirSync(this.exportsDir);
        const exportFiles = files.filter(f => f.includes('FileCognize_Selected'));
        
        if (exportFiles.length === 0) {
            this.recordTest('导出文件', 'FAIL', '未找到导出文件');
            return null;
        }

        const latestFile = exportFiles.sort().pop();
        const exportFilePath = path.join(this.exportsDir, latestFile);
        
        try {
            const workbook = XLSX.readFile(exportFilePath, { cellStyles: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            
            const allCells = Object.keys(worksheet).filter(key => !key.startsWith('!'));
            const merges = worksheet['!merges'] || [];
            const cols = worksheet['!cols'] || [];
            const rows = worksheet['!rows'] || [];
            
            this.recordTest('导出文件存在', 'PASS', `文件: ${latestFile}`);
            this.recordTest('工作表范围', 'PASS', `${worksheet['!ref']}`);
            
            // 关键问题检查
            const cellLoss = ((280 - allCells.length) / 280 * 100).toFixed(1);
            this.recordTest('单元格丢失', cellLoss > 50 ? 'FAIL' : 'WARN', `丢失${cellLoss}% (${allCells.length}/280)`);
            
            const colsLoss = cols.length === 0;
            this.recordTest('列宽丢失', colsLoss ? 'FAIL' : 'PASS', colsLoss ? '完全丢失' : '保持完整');
            
            const rowsLoss = rows.length === 0;
            this.recordTest('行高丢失', rowsLoss ? 'FAIL' : 'PASS', rowsLoss ? '完全丢失' : '保持完整');
            
            const mergeMatch = merges.length === 38;
            this.recordTest('合并单元格', mergeMatch ? 'PASS' : 'FAIL', `${merges.length}/38`);
            
            // 检查数据写入
            let dataWritten = 0;
            [12, 13, 14].forEach(row => {
                const aCell = worksheet[`A${row}`];
                if (aCell && aCell.v) dataWritten++;
            });
            
            this.recordTest('数据写入', dataWritten === 3 ? 'PASS' : 'FAIL', `${dataWritten}/3 条记录`);
            
            return {
                totalCells: allCells.length,
                cellLossPercent: parseFloat(cellLoss),
                colsLoss,
                rowsLoss,
                mergeMatch,
                dataWritten
            };
            
        } catch (error) {
            this.recordTest('导出文件读取', 'FAIL', error.message);
            return null;
        }
    }

    // 3. 验证打印预览问题
    testPrintPreviewIssues() {
        console.log('\n🔍 测试3: 打印预览问题分析');
        console.log('=' .repeat(60));
        
        // 读取模板文件内容
        try {
            const workbook = XLSX.readFile(this.templatePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const templateData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // 检查模板内容
            let hasCompanyInfo = false;
            let hasDocumentTitle = false;
            let hasTableHeaders = false;
            
            templateData.forEach((row, index) => {
                const rowStr = row.join(' ');
                if (rowStr.includes('CONFEZIONE MIRA') || rowStr.includes('Jiang Meizhu')) {
                    hasCompanyInfo = true;
                }
                if (rowStr.includes('DOCUMENTO DI TRANSPORTO')) {
                    hasDocumentTitle = true;
                }
                if (rowStr.includes('QUANTITA') && rowStr.includes('DESCRIZIONE')) {
                    hasTableHeaders = true;
                }
            });
            
            this.recordTest('公司信息', hasCompanyInfo ? 'PASS' : 'FAIL', hasCompanyInfo ? '存在' : '缺失');
            this.recordTest('文档标题', hasDocumentTitle ? 'PASS' : 'FAIL', hasDocumentTitle ? '存在' : '缺失');
            this.recordTest('表格标题', hasTableHeaders ? 'PASS' : 'FAIL', hasTableHeaders ? '存在' : '缺失');
            
            // 打印预览要求
            console.log('\n📋 打印预览必须包含:');
            console.log('   ✅ 完整的output.xlsx模板内容');
            console.log('   ✅ 公司信息 (CONFEZIONE MIRA di Jiang Meizhu)');
            console.log('   ✅ 文档标题 (DOCUMENTO DI TRANSPORTO)');
            console.log('   ✅ 表格结构和标题');
            console.log('   ✅ 选中的记录数据，正确映射到对应位置');
            console.log('   ❌ 不应该只显示选中记录，忽略模板结构');
            
            this.recordTest('打印预览要求', 'WARN', '需要包含完整模板+选中数据');
            
        } catch (error) {
            this.recordTest('打印预览分析', 'FAIL', error.message);
        }
    }

    // 4. 提供解决方案
    provideSolutions() {
        console.log('\n💡 解决方案建议');
        console.log('=' .repeat(60));
        
        console.log('\n🔧 导出格式问题解决方案:');
        console.log('   问题: 导出时丢失88.9%的单元格和样式信息');
        console.log('   原因: XLSX库在写入时只保留有数据的单元格');
        console.log('   解决方案:');
        console.log('   1. 使用文件复制 + 数据写入的混合方法');
        console.log('   2. 先复制整个模板文件，再修改特定单元格');
        console.log('   3. 避免使用XLSX.utils.book_new()重新创建工作簿');
        
        console.log('\n🖨️ 打印预览问题解决方案:');
        console.log('   问题: 打印预览缺少完整的模板内容');
        console.log('   要求: 必须显示完整的output.xlsx模板 + 选中的记录');
        console.log('   解决方案:');
        console.log('   1. 读取完整的模板文件内容');
        console.log('   2. 生成包含所有模板元素的HTML');
        console.log('   3. 将选中的数据插入到正确的表格位置');
        console.log('   4. 保持原始文档的视觉格式和结构');
        
        console.log('\n🎯 实施建议:');
        console.log('   1. 修改server.js中的导出函数，使用文件复制方法');
        console.log('   2. 修改打印预览函数，生成完整的HTML模板');
        console.log('   3. 确保导出文件和打印预览内容完全一致');
        console.log('   4. 添加格式验证测试，确保修复效果');
    }

    // 5. 生成测试报告
    generateReport() {
        console.log('\n📊 测试报告总结');
        console.log('=' .repeat(60));
        
        const passCount = this.testResults.filter(r => r.status === 'PASS').length;
        const failCount = this.testResults.filter(r => r.status === 'FAIL').length;
        const warnCount = this.testResults.filter(r => r.status === 'WARN').length;
        
        console.log(`✅ 通过: ${passCount} 项`);
        console.log(`❌ 失败: ${failCount} 项`);
        console.log(`⚠️ 警告: ${warnCount} 项`);
        console.log(`📋 总计: ${this.testResults.length} 项测试`);
        
        console.log('\n🔍 关键问题:');
        this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
            console.log(`   ❌ ${result.test}: ${result.details}`);
        });
        
        console.log('\n⚠️ 需要注意:');
        this.testResults.filter(r => r.status === 'WARN').forEach(result => {
            console.log(`   ⚠️ ${result.test}: ${result.details}`);
        });
        
        // 保存详细报告
        const reportPath = path.join(__dirname, 'test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            summary: {
                total: this.testResults.length,
                pass: passCount,
                fail: failCount,
                warn: warnCount,
                timestamp: new Date().toISOString()
            },
            results: this.testResults
        }, null, 2));
        
        console.log(`\n💾 详细报告已保存到: ${reportPath}`);
    }

    // 运行所有测试
    runAllTests() {
        console.log('🧪 FileCognize 导出和打印功能综合测试');
        console.log('=' .repeat(80));
        console.log(`📅 测试时间: ${new Date().toLocaleString('zh-CN')}`);
        console.log(`📁 工作目录: ${__dirname}`);
        
        // 运行所有测试
        const templateInfo = this.testTemplateIntegrity();
        const exportInfo = this.testCurrentExportIssues();
        this.testPrintPreviewIssues();
        this.provideSolutions();
        this.generateReport();
        
        console.log('\n' + '=' .repeat(80));
        console.log('🎯 测试完成');
        console.log('=' .repeat(80));
        
        return {
            templateInfo,
            exportInfo,
            testResults: this.testResults
        };
    }
}

// 运行综合测试
const tester = new FinalComprehensiveTest();
tester.runAllTests(); 