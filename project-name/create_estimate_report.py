from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_BREAK
from docx.enum.table import WD_ROW_HEIGHT_RULE
from pathlib import Path

OUT = Path('人力资本SaaS多端平台_工期与项目制报价评估.docx')

def set_cell_shading(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tcPr.append(shd)
    shd.set(qn('w:fill'), fill)

def set_cell_border(cell, **kwargs):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = tcPr.first_child_found_in('w:tcBorders')
    if tcBorders is None:
        tcBorders = OxmlElement('w:tcBorders')
        tcPr.append(tcBorders)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        if edge in kwargs:
            tag = 'w:{}'.format(edge)
            element = tcBorders.find(qn(tag))
            if element is None:
                element = OxmlElement(tag)
                tcBorders.append(element)
            for key in ['val','sz','space','color']:
                if key in kwargs[edge]:
                    element.set(qn('w:{}'.format(key)), str(kwargs[edge][key]))

def set_cell_text(cell, text, bold=False, color=None, size=10.5, align=None):
    cell.text = ''
    p = cell.paragraphs[0]
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(str(text))
    r.bold = bold
    r.font.size = Pt(size)
    r.font.name = 'Microsoft YaHei'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

def set_table_widths(table, widths):
    widths = [w * 6.67 / sum(widths) for w in widths]
    for idx, width in enumerate(widths):
        table.columns[idx].width = Inches(width)
    for row in table.rows:
        for idx, width in enumerate(widths):
            row.cells[idx].width = Inches(width)

def style_table(table, header=True):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'
    for row in table.rows:
        trPr = row._tr.get_or_add_trPr()
        trPr.append(OxmlElement('w:cantSplit'))
        for cell in row.cells:
            set_cell_border(cell, top={'val':'single','sz':'4','color':'D9E2F3'}, bottom={'val':'single','sz':'4','color':'D9E2F3'}, left={'val':'single','sz':'4','color':'D9E2F3'}, right={'val':'single','sz':'4','color':'D9E2F3'})
    if header:
        table.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        for cell in table.rows[0].cells:
            set_cell_shading(cell, '1F4E78')
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.color.rgb = RGBColor(255,255,255)
                    r.bold = True

def add_bullet(doc, text, level=0):
    p = doc.add_paragraph(style='List Bullet' if level == 0 else 'List Bullet 2')
    p.paragraph_format.space_after = Pt(3)
    p.add_run(text)
    return p

def add_number(doc, text):
    p = doc.add_paragraph(style='List Number')
    p.paragraph_format.space_after = Pt(3)
    p.add_run(text)
    return p

def add_note(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.2)
    p.paragraph_format.right_indent = Inches(0.2)
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run(text)
    r.font.size = Pt(9.5)
    r.font.color.rgb = RGBColor(89,89,89)
    return p

# Document setup
doc = Document()
sec = doc.sections[0]
sec.page_width = Inches(8.27)
sec.page_height = Inches(11.69)
sec.top_margin = Inches(0.65)
sec.bottom_margin = Inches(0.65)
sec.left_margin = Inches(0.8)
sec.right_margin = Inches(0.8)

styles = doc.styles
styles['Normal'].font.name = 'Microsoft YaHei'
styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
styles['Normal'].font.size = Pt(10.5)
styles['Normal'].paragraph_format.space_after = Pt(6)
for style_name, size, color in [('Title', 24, '1F4E78'), ('Heading 1', 16, '1F4E78'), ('Heading 2', 12.5, '2F75B5')]:
    st = styles[style_name]
    st.font.name = 'Microsoft YaHei'
    st._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
    st.font.size = Pt(size)
    st.font.color.rgb = RGBColor.from_string(color)
    st.font.bold = True

# Header/footer
header = sec.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
hr = header.add_run('项目评估与报价建议｜人力资本 SaaS 多端平台')
hr.font.size = Pt(8)
hr.font.color.rgb = RGBColor(128,128,128)
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer.add_run('本文件为基于当前需求清单的初步项目评估，最终以需求确认及合同范围为准')
fr.font.size = Pt(8)
fr.font.color.rgb = RGBColor(128,128,128)

# Cover
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(56)
r = p.add_run('人力资本 SaaS 多端平台')
r.font.name = 'Microsoft YaHei'; r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
r.font.size = Pt(26); r.font.bold = True; r.font.color.rgb = RGBColor(31,78,121)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run('工期与项目制报价评估报告')
r.font.size = Pt(20); r.font.bold = True; r.font.color.rgb = RGBColor(47,117,181)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(24)
r = p.add_run('评估依据：人力资本SaaS多端平台9.30.xlsx')
r.font.size = Pt(11); r.font.color.rgb = RGBColor(89,89,89)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(120)
r = p.add_run('建议项目总价：68.8 万元\n建议交付周期：7–8 个月')
r.font.size = Pt(18); r.font.bold = True; r.font.color.rgb = RGBColor(31,78,121)
doc.add_page_break()

# Executive summary
doc.add_heading('一、评估结论', level=1)
add_note(doc, '本报告基于用户提供的 Excel 功能清单进行工作量、工期和项目制价格评估。当前清单适合作为报价和立项依据，但在正式签约前仍需完成原型确认、接口清单确认、数据口径确认和验收标准确认。')
summary = doc.add_table(rows=1, cols=2)
summary.autofit = False
set_table_widths(summary, [2.2, 4.8])
for i, h in enumerate(['评估项目','建议结论']): set_cell_text(summary.rows[0].cells[i], h, bold=True, color='FFFFFF', align=WD_ALIGN_PARAGRAPH.CENTER)
for k,v in [
    ('Excel 明细人天','207 人天（按 G3:G79 数值合计）'),
    ('建议实际投入','约 300–360 人天，已考虑架构、联调、测试、上线及返工风险'),
    ('推荐团队','项目/产品 1 人、后端 2 人、Web 前端 1 人、小程序 1 人、UI 0.5–1 人、测试 1 人'),
    ('完整版本周期','7–8 个月；不建议承诺 3 个月完成全部范围'),
    ('推荐项目制报价','68.8 万元人民币'),
    ('商务谈判底价','建议不低于 58 万元；低于该价格应同步缩减范围'),
    ('建议质保','上线后 3 个月，第三方服务费和新增需求另计'),
]:
    cells = summary.add_row().cells
    set_cell_text(cells[0], k, bold=True)
    set_cell_text(cells[1], v)
style_table(summary)
add_note(doc, '报价定位：这是一个多租户、强权限、多角色、强流程、涉及资金及第三方接口的人力资本 SaaS，不应按普通单体后台或纯页面开发项目报价。')

# Scope
doc.add_heading('二、需求范围与复杂度判断', level=1)
for text in [
    'SaaS 总平台端：租户新增、禁用、注销、套餐及功能开关、全平台运营数据、全局角色模板、操作日志、接口配置、消息模板、备份策略。',
    '租户管理后台：企业设置、员工档案与参保、报表、流程审批、招聘、合同、学习库、商城、系统运维。',
    '财务与资金相关能力：预算、对账、薪资导入与审核、批量代发、发薪预警、借支、钱包账户、银行卡绑定、提现和扣款标识。',
    '微信小程序多角色端：企管、财务、销售、员工共用一个小程序，按身份展示不同首页及权限，覆盖审批、考勤、合同、学习、商城、招聘、参保等场景。',
    '通用系统能力：微信登录及手机号登录、实名认证/人脸核验、定位打卡、消息通知、简阳在线跳转、法大大电子签章、支付和多端联调。',
]: add_bullet(doc, text)

doc.add_heading('三、工作量拆解', level=1)
t = doc.add_table(rows=1, cols=4)
t.autofit = False
set_table_widths(t, [2.0, 1.3, 1.3, 3.2])
for i,h in enumerate(['范围','清单特征','表格人天','评估说明']): set_cell_text(t.rows[0].cells[i], h, bold=True, color='FFFFFF', align=WD_ALIGN_PARAGRAPH.CENTER)
rows = [
    ('SaaS 总后台','平台级管控','约 16','涉及租户隔离、套餐开关、全局日志与备份'),
    ('租户管理后台','企业管理及财务销售','约 78','业务密度最高，包含薪资、借支、合同、商城、审批等复杂逻辑'),
    ('微信小程序端','四角色共用','约 76','页面数量多，依赖统一权限、身份识别、消息和接口能力'),
    ('通用系统能力及实施','接口、设计、测试、联调','约 37','包含法大大、招聘平台、三端联调、适配测试、上线支持'),
    ('合计','G3:G79 数值合计','207','原表估算值，偏页面级；需增加工程化及风险缓冲'),
]
for row in rows:
    cells=t.add_row().cells
    for i,v in enumerate(row): set_cell_text(cells[i], v, bold=(row[0]=='合计' or i==0))
style_table(t)
add_note(doc, '说明：原表中部分功能同时包含多个隐含子需求，例如导入校验、批量处理、消息触发、权限边界、状态流转及异常处理。项目报价应以“可验收的业务闭环”为单位，而不是只按页面数量计算。')

# Schedule
doc.add_heading('四、建议团队与交付周期', level=1)
t = doc.add_table(rows=1, cols=3)
t.autofit=False; set_table_widths(t,[2.6,1.2,3.7])
for i,h in enumerate(['角色','建议配置','主要职责']): set_cell_text(t.rows[0].cells[i],h,bold=True,color='FFFFFF',align=WD_ALIGN_PARAGRAPH.CENTER)
for row in [
    ('项目经理 / 产品经理','1 人','需求拆解、原型、排期、验收与客户沟通'),
    ('后端工程师','2 人','多租户、权限、流程、财务、接口、数据与部署'),
    ('Web 前端工程师','1 人','SaaS 总后台和租户管理后台'),
    ('微信小程序工程师','1 人','多角色小程序、微信能力、支付、定位及兼容'),
    ('UI/UX 设计师','0.5–1 人','交互、视觉、组件规范和页面设计'),
    ('测试工程师','1 人','功能、接口、权限、兼容、回归及上线测试'),
]:
    cells=t.add_row().cells
    for i,v in enumerate(row): set_cell_text(cells[i],v,bold=(i==0))
style_table(t)

doc.add_heading('阶段排期建议', level=2)
t = doc.add_table(rows=1, cols=3); t.autofit=False; set_table_widths(t,[2.5,1.4,3.6])
for i,h in enumerate(['阶段','周期','交付重点']): set_cell_text(t.rows[0].cells[i],h,bold=True,color='FFFFFF',align=WD_ALIGN_PARAGRAPH.CENTER)
for row in [
    ('需求确认与技术方案','2–3 周','需求边界、角色权限、数据模型、接口清单、验收口径'),
    ('产品原型与 UI 设计','2–3 周','三端信息架构、核心流程、视觉规范、组件和高频页面'),
    ('后台核心模块开发','8–10 周','总平台、租户后台、档案、审批、合同、报表'),
    ('小程序端开发','7–9 周','四角色首页、员工业务、财务、销售、商城及学习'),
    ('财务/钱包/第三方接口','5–7 周','薪资、借支、提现、支付、实名、电子签章及招聘跳转'),
    ('联调、测试与修复','4–6 周','三端联调、权限校验、兼容测试、回归和性能问题'),
    ('上线、培训与验收','1–2 周','部署、数据初始化、操作培训、上线陪跑及验收资料'),
]:
    cells=t.add_row().cells
    for i,v in enumerate(row): set_cell_text(cells[i],v,bold=(i==0))
style_table(t)
add_note(doc, '整体周期建议：7–8 个月。各阶段可并行推进，但必须保留完整联调和回归测试时间。若客户接口、资质或业务规则确认延迟，项目周期应顺延。')

# Pricing
doc.add_heading('五、项目制报价建议', level=1)
t = doc.add_table(rows=1, cols=4); t.autofit=False; set_table_widths(t,[1.45,1.45,1.35,3.25])
for i,h in enumerate(['方案','周期','建议价格','适用范围']): set_cell_text(t.rows[0].cells[i],h,bold=True,color='FFFFFF',align=WD_ALIGN_PARAGRAPH.CENTER)
for row in [
    ('一期 MVP','4–5 个月','42–48 万元','保留 SaaS 基础、档案、审批、合同、基础考勤、基础薪资和员工端，暂缓商城、复杂财务等'),
    ('完整一期（推荐）','7–8 个月','68.8 万元','覆盖当前清单主要功能，完成三端、财务、商城、合同、招聘和接口联调'),
    ('商业化增强版','8–10 个月','78–95 万元','增加运营级监控、灾备、安全合规、增强 BI、计费及更充分的验收与优化'),
]:
    cells=t.add_row().cells
    for i,v in enumerate(row): set_cell_text(cells[i],v,bold=(i==0))
style_table(t)

p=doc.add_paragraph()
p.paragraph_format.space_before=Pt(10)
p.alignment=WD_ALIGN_PARAGRAPH.CENTER
r=p.add_run('推荐对外报价：68.8 万元人民币，项目周期 7–8 个月')
r.bold=True; r.font.size=Pt(15); r.font.color.rgb=RGBColor(192,0,0)

# Payment

doc.add_heading('六、付款节点建议', level=1)
t = doc.add_table(rows=1, cols=3); t.autofit=False; set_table_widths(t,[1.0,1.4,5.1])
for i,h in enumerate(['比例','节点','付款条件']): set_cell_text(t.rows[0].cells[i],h,bold=True,color='FFFFFF',align=WD_ALIGN_PARAGRAPH.CENTER)
for row in [
    ('30%','合同签订','需求确认、项目启动、原型和技术方案进入执行'),
    ('40%','核心功能完成','总后台、租户后台、小程序主要功能完成，进入三端联调'),
    ('20%','上线试运行','测试完成、部署上线、客户试运行并提交问题清单'),
    ('10%','最终验收','完成约定范围问题修复，交付部署及项目文档，客户验收'),
]:
    cells=t.add_row().cells
    for i,v in enumerate(row): set_cell_text(cells[i],v,bold=(i==0))
style_table(t)

# Exclusions
doc.add_heading('七、报价边界与不包含项', level=1)
add_note(doc, '以下费用原则上不包含在 68.8 万元软件开发项目费内，应由客户另行承担或按实际发生费用结算：')
for text in [
    '微信认证、小程序认证、支付手续费及相关平台服务费用。',
    '服务器、数据库、对象存储、CDN、短信、音视频和地图定位等云资源费用。',
    '法大大电子签章、实名认证、人脸识别、OCR、银行卡核验等第三方服务费用。',
    '银行代发、支付通道、提现通道、税务或其他金融机构产生的服务费用。',
    '简阳在线平台接口改造、第三方平台新增接口开发及对方平台收费。',
    '客户在需求确认后新增的功能、超出约定次数的重大需求变更和大范围 UI 重做。',
    '长期运营、驻场服务、超出质保期的维护及新增业务模块。',
]: add_bullet(doc, text)

doc.add_heading('八、项目风险与签约建议', level=1)
for text in [
    '先锁定“角色—数据—流程—状态—权限”五类基础规则，再进入批量开发，避免后期返工。',
    '薪资、借支、钱包、提现和银行卡等资金相关模块应单独确认数据口径、对账规则、异常处理和审计要求。',
    '法大大、微信支付、实名认证、人脸核验、定位和招聘平台接口应在启动阶段取得正式接口文档及测试资质。',
    '合同应明确：需求冻结点、原型确认机制、验收标准、第三方依赖、客户配合事项和延期责任。',
    '建议将商城、学习库和部分招聘能力设计为可独立验收的模块，便于在预算或周期变化时分期交付。',
]: add_number(doc, text)

# Final recommendation
doc.add_heading('九、最终建议', level=1)
p=doc.add_paragraph()
p.paragraph_format.space_after=Pt(8)
r=p.add_run('建议采用“完整一期”方案：')
r.bold=True; r.font.size=Pt(12)
p=doc.add_paragraph()
r=p.add_run('项目总价 68.8 万元，项目周期 7–8 个月，推荐 5–6 人团队，含上线后 3 个月质保；第三方服务费、云资源费和新增需求另计。')
r.bold=True; r.font.size=Pt(12); r.font.color.rgb=RGBColor(31,78,121)
add_note(doc, '该报价能够覆盖当前 Excel 清单的主要业务闭环，并为多租户、财务资金、第三方接口和多端联调保留合理风险空间。若客户预算低于 58 万元，建议优先缩减商城、学习库、复杂钱包/提现和部分财务自动化能力，而不是单纯压缩开发周期。')

# Metadata
doc.core_properties.title = '人力资本SaaS多端平台工期与项目制报价评估报告'
doc.core_properties.subject = '项目工期、工作量及项目制报价评估'
doc.core_properties.author = '项目评估'
doc.core_properties.keywords = 'SaaS, 人力资本, 项目报价, 工期评估'

doc.save(OUT)
print(OUT)
