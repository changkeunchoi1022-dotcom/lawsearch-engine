import * as XLSX from 'xlsx';
import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  ApplicabilityAssessment,
  Project,
  ProjectEvent,
  ProvisionVersion,
  RESEARCH_CATEGORY_LABELS,
  ReviewDecision,
  SourceRecord,
  WorkspaceMode,
} from '../types/legalDomain.ts';
import { SYNTHETIC_WARNING_LABEL } from '../data/seedData.ts';

export interface MatrixExportInput {
  project: Project;
  events: ProjectEvent[];
  assessments: ApplicabilityAssessment[];
  provisions: ProvisionVersion[];
  sources: SourceRecord[];
  decisions: ReviewDecision[];
  generatedBy: string;
}

/**
 * Generates and downloads an authentic .xlsx spreadsheet with the exact 14 Korean columns
 * specified in Section 8.D and metadata cover rows.
 */
export function exportReviewMatrixToXlsx(input: MatrixExportInput): void {
  const { project, events, assessments, provisions, sources, generatedBy } = input;
  const allApproved =
    assessments.length > 0 && assessments.every((a) => a.status === '법무 검토 완료');
  const approvalBanner = allApproved ? '법무 검토 완료' : '법무 검토 전 (확정 결론 아님)';
  const nowKst =
    new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';

  const rows = assessments.map((a) => {
    const ev = events.find((e) => e.id === a.eventId);
    const pv = provisions.find((p) => p.id === a.provisionVersionId);
    const src = pv ? sources.find((s) => s.id === pv.sourceRecordId) : undefined;

    const versionAndEffective = pv
      ? `${pv.amendmentNumber} (공포: ${pv.promulgationDate || '미상'} / 일반시행: ${
          pv.generalEffectiveDate || '미상'
        } / 조문시행: ${pv.provisionEffectiveDate || pv.generalEffectiveDate || '미상'})`
      : '버전 미확인';

    const judgmentLabel =
      a.status === '법무 검토 완료' && a.legalReviewConclusion
        ? `${a.legalReviewConclusion} (법무 검토 완료)`
        : `${a.status} [법무 검토 전]`;

    return {
      '검토 분야': RESEARCH_CATEGORY_LABELS[a.researchCategory] || a.researchCategory,
      쟁점:
        project.workspaceMode === WorkspaceMode.DEMO
          ? `[${SYNTHETIC_WARNING_LABEL}] ${a.issueTitle}`
          : a.issueTitle,
      '관련 공사 이벤트': ev ? `${ev.eventTitle} (${ev.eventDate || '일자 미상'})` : '이벤트 미지정',
      기준일: a.referenceDateUsed
        ? `${a.referenceDateUsed} (${a.referenceDateTypeLabel})`
        : '일자 미상 (추정 금지)',
      '법령·문서명': pv?.officialDocumentTitle || '문서 미지정',
      조문: pv ? `${pv.articleNumber} (${pv.articleTitle})` : '-',
      '버전·시행일': versionAndEffective,
      '적용 판단': judgmentLabel,
      '판단 근거': `${a.modelOrRuleAnalysisText}\n[원문 발췌] ${a.verbatimSourceExcerpt}`,
      '부칙·경과조치': a.supplementaryAndTransitionalAnalysis || '-',
      '미확인 사항':
        a.unresolvedIssues.length > 0 ? a.unresolvedIssues.join(' / ') : '식별된 미확인 사항 없음',
      '원문 링크': src?.officialUrlOrFileRef || '내부 문서함 참조',
      담당자: a.reviewedBy || a.assignedReviewer,
      '검토 상태': a.status === '법무 검토 완료' ? '법무 검토 완료' : `${a.status} (법무 검토 전)`,
    };
  });

  const metaSheetData = [
    ['항목', '내용'],
    [
      '문서 보안 및 검토 상태 표지',
      project.workspaceMode === WorkspaceMode.DEMO
        ? `${SYNTHETIC_WARNING_LABEL} / ${approvalBanner}`
        : approvalBanner,
    ],
    ['프로젝트 코드 및 명칭', `[${project.projectCode}] ${project.projectName}`],
    ['발주처(계약주체)', `${project.contractingPrincipal} (${project.institutionCategory})`],
    ['조달 대행기관', project.procurementAgency],
    ['적용 계약 법제 체계', `${project.contractingRegimeStatus} — ${project.contractingRegimeValue}`],
    ['연구 기준일 (Research Cutoff)', project.researchCutoffDate],
    ['보고서 생성 시각 (Asia/Seoul)', nowKst],
    ['생성자', generatedBy],
    [
      '미해결 쟁점 건수',
      `${assessments.reduce((acc, cur) => acc + cur.unresolvedIssues.length, 0)}건`,
    ],
  ];

  const wb = XLSX.utils.book_new();
  const wsMatrix = XLSX.utils.json_to_sheet(rows);
  const wsMeta = XLSX.utils.aoa_to_sheet(metaSheetData);

  XLSX.utils.book_append_sheet(wb, wsMatrix, '시점별_법령적용_검토매트릭스');
  XLSX.utils.book_append_sheet(wb, wsMeta, '표지_및_검토메타데이터');

  const safeCode = project.projectCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `공공공사_법령시점검토_매트릭스_${safeCode}_${project.researchCutoffDate}.xlsx`);
}

/**
 * Generates and downloads an authentic .docx Word report with Executive Summary,
 * Review Matrix, Missing-Evidence Request List, Source Appendix, and Review History.
 */
export async function exportReviewReportToDocx(input: MatrixExportInput): Promise<void> {
  const { project, events, assessments, provisions, sources, decisions, generatedBy } = input;
  const allApproved =
    assessments.length > 0 && assessments.every((a) => a.status === '법무 검토 완료');
  const approvalBanner = allApproved ? '법무 검토 완료' : '법무 검토 전 — 최종 법률 의견으로 사용 불가';
  const nowKst =
    new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00';

  const unresolvedList = assessments.flatMap((a) =>
    a.unresolvedIssues.map((issue) => `[${a.issueTitle}] ${issue}`)
  );

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: `공공공사 법령 시점검토 보고서`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `[검토 상태 표지: ${approvalBanner}]`,
          bold: true,
        }),
      ],
    }),
  ];

  if (project.workspaceMode === WorkspaceMode.DEMO) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[경고: ${SYNTHETIC_WARNING_LABEL}]`,
            bold: true,
          }),
        ],
      })
    );
  }

  // 1. Executive Summary
  children.push(
    new Paragraph({ text: '1. 경영진 요약 (Executive Summary)', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      text: `• 프로젝트명: [${project.projectCode}] ${project.projectName}`,
    }),
    new Paragraph({
      text: `• 발주처(계약주체): ${project.contractingPrincipal} / 조달대행: ${project.procurementAgency}`,
    }),
    new Paragraph({
      text: `• 계약 법제 체계 검증 상태: ${project.contractingRegimeStatus} (${project.contractingRegimeValue})`,
    }),
    new Paragraph({
      text: `• 검토 기준일(Cutoff Date): ${project.researchCutoffDate} / 보고서 생성일시: ${nowKst} / 작성자: ${generatedBy}`,
    }),
    new Paragraph({
      text: `• 총 검토 쟁점: ${assessments.length}건 (법무 검토 완료: ${
        assessments.filter((a) => a.status === '법무 검토 완료').length
      }건, 미확인·추가검토 필요: ${
        assessments.filter((a) => a.status !== '법무 검토 완료').length
      }건)`,
    })
  );

  // 2. Detailed Applicability Review Matrix
  children.push(
    new Paragraph({
      text: '2. 상세 시점별 적용 법령 검토 매트릭스',
      heading: HeadingLevel.HEADING_2,
    })
  );

  for (const a of assessments) {
    const ev = events.find((e) => e.id === a.eventId);
    const pv = provisions.find((p) => p.id === a.provisionVersionId);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `■ [${RESEARCH_CATEGORY_LABELS[a.researchCategory] || a.researchCategory}] ${a.issueTitle}`,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        text: `  - 관련 이벤트 및 기준일: ${ev?.eventTitle || '-'} (${
          a.referenceDateUsed || '일자 미상'
        } / ${a.referenceDateTypeLabel})`,
      }),
      new Paragraph({
        text: `  - 대상 법령 및 버전: ${pv?.officialDocumentTitle || '-'} ${
          pv?.articleNumber || ''
        } (${pv?.amendmentNumber || ''}, 공포일 ${pv?.promulgationDate || '미상'}, 일반시행일 ${
          pv?.generalEffectiveDate || '미상'
        }, 조문시행일 ${pv?.provisionEffectiveDate || pv?.generalEffectiveDate || '미상'})`,
      }),
      new Paragraph({
        text: `  - 검토 상태 및 결론: ${a.status}${
          a.legalReviewConclusion ? ` [법무 결론: ${a.legalReviewConclusion}]` : ' [법무 검토 전]'
        }`,
      }),
      new Paragraph({
        text: `  - [수집 원문 발췌]: ${a.verbatimSourceExcerpt}`,
      }),
      new Paragraph({
        text: `  - [적용 및 부칙·경과조치 판단 근거]: ${a.modelOrRuleAnalysisText}`,
      })
    );
  }

  // 3. Missing-Evidence Request List
  children.push(
    new Paragraph({
      text: '3. 미확보 원문 및 추가 사실 확인 요청 목록 (Missing-Evidence Request List)',
      heading: HeadingLevel.HEADING_2,
    })
  );

  if (unresolvedList.length === 0) {
    children.push(new Paragraph({ text: '• 현재 식별된 미확인 사실 또는 미확보 원문이 없습니다.' }));
  } else {
    unresolvedList.forEach((item, idx) => {
      children.push(new Paragraph({ text: `${idx + 1}. ${item}` }));
    });
  }

  // 4. Source Appendix
  children.push(
    new Paragraph({
      text: '4. 법령·예규·계약조건 원문 부록 (Source Appendix)',
      heading: HeadingLevel.HEADING_2,
    })
  );

  sources.forEach((src) => {
    children.push(
      new Paragraph({
        text: `• [${src.sourceCategory}] ${src.officialTitle} (발령기관: ${src.issuingAuthority}, 공식ID: ${src.officialSourceId}, 수집일시: ${src.retrievedAt}, 출처: ${src.officialUrlOrFileRef})`,
      })
    );
  });

  // 5. Review and Approval History
  children.push(
    new Paragraph({
      text: '5. 법무 검토 및 결재 이력 (Review & Approval History)',
      heading: HeadingLevel.HEADING_2,
    })
  );

  if (decisions.length === 0) {
    children.push(new Paragraph({ text: '• 등록된 법무 검토 완료 결재 이력이 없습니다 (법무 검토 전).' }));
  } else {
    const tableRows = [
      new TableRow({
        children: ['검토일시(KST)', '검토자', '검토 상태', '법무 결론', '검토 사유'].map(
          (headerText) =>
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: headerText, bold: true })] })],
            })
        ),
      }),
      ...decisions.map(
        (d) =>
          new TableRow({
            children: [
              d.decidedAt,
              `${d.reviewerName} (${d.reviewerRole})`,
              d.resultingStatus,
              d.recordedConclusion || '-',
              d.reasonText,
            ].map(
              (cellText) =>
                new TableCell({
                  width: { size: 20, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ text: cellText })],
                })
            ),
          })
      ),
    ];
    children.push(new Table({ rows: tableRows }));
  }

  const doc = new DocxDocument({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeCode = project.projectCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  a.href = url;
  a.download = `공공공사_법령시점검토_보고서_${safeCode}_${project.researchCutoffDate}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
