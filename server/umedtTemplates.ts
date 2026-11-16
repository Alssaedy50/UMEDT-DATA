export function generateUmedtDataReadme(dataRepo = 'Alssaedy50/UMEDT-DATA'): string {
  return `# مستودع بيانات UMEDT الطبي (${dataRepo})

هذا المستودع هو المصدر الرسمي المستقل لبيانات برنامج **UMEDT** لنشر وتحديث:
- **البلوكات والمواد والمواضيع** (\`blocks.json\`, \`subjects.json\`, \`topics.json\`)
- **المصطلحات والجمل والسوابق والاختصارات** (\`terms.json\`, \`sentences.json\`, \`custom-affixes.json\`, \`custom-abbreviations.json\`)
- **بنك الأسئلة والمرفقات والوسائط** (\`questions.json\`, \`media-index.json\`, \`data/media/\`)
- **حزم التحديث الموقعة** (\`data/releases/stable/\`, \`data/releases/beta/\`)

لا يحتوي هذا المستودع على كود تطبيق **UMEDT** أو بيانات المستخدم الشخصية (المفضلة، سجل المراجعة SRS، الملاحظات الخاصة).

## البنية المعتمدة
\`\`\`text
data/
  master/
    blocks.json
    subjects.json
    topics.json
    terms.json
    sentences.json
    custom-affixes.json
    custom-abbreviations.json
    questions.json
    media-index.json
  media/
    <sha256_prefix>-<filename>
  releases/
    stable/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
    beta/
      manifest.json
      umed2-data-<version>.zip
      CHANGELOG.md
\`\`\`

## روابط القراءة المباشرة لتطبيق UMEDT
- **Manifest التحديث السحابي (OTA):**
  \`https://raw.githubusercontent.com/${dataRepo}/main/data/releases/stable/manifest.json\`
- **بيانات البلوكات والمصطلحات المباشرة:**
  \`https://raw.githubusercontent.com/${dataRepo}/main/data/master/blocks.json\`
  \`https://raw.githubusercontent.com/${dataRepo}/main/data/master/terms.json\`
  \`https://raw.githubusercontent.com/${dataRepo}/main/data/master/media-index.json\`

## مبدأ الأمان وعدم الإضرار بالمشروع الأصلي
1. جميع التحديثات تُقرأ وتُدمج عبر المعرفات الفريدة (\`id\`) بدون استبدال كود التطبيق أو تفضيلات المستخدم المحلية (\`favorite\`, \`srsData\`, \`studyStats\`).
2. المرفقات تُخزن بأسماء تتضمن بصمة \`SHA-256\` لمنع التكرار وتقليل حجم التنزيل.
`;
}

export function generateUmedtDataWorkflowYml(
  sourceRepo = 'Alssaedy50/UMEDT',
  dataRepo = 'Alssaedy50/UMEDT-DATA'
): string {
  return `name: UMEDT Medical Data Release

on:
  push:
    branches:
      - main
    paths:
      - 'data/master/**'
      - 'data/media/**'
  workflow_dispatch:
    inputs:
      channel:
        description: 'Release channel'
        required: true
        default: 'stable'
        type: choice
        options:
          - stable
          - beta
      target_version:
        description: 'Optional data version (empty = automatic patch version)'
        required: false
        type: string
        default: ''
      summary:
        description: 'Release notes'
        required: false
        type: string
        default: ''
      dry_run:
        description: 'Build and verify without committing release artifacts'
        required: false
        type: boolean
        default: false

permissions:
  contents: write

concurrency:
  group: umedt-data-release-\${{ github.event.inputs.channel || 'stable' }}
  cancel-in-progress: false

jobs:
  publish-data:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout data repository
        uses: actions/checkout@v4
        with:
          persist-credentials: true

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Clone UMEDT publisher source
        run: git clone --depth 1 https://github.com/${sourceRepo}.git app

      - name: Install publisher dependencies
        run: npm ci --prefix app

      - name: Validate master JSON files & media index
        run: |
          node <<'NODE'
          const fs = require('fs');
          const requiredFiles = [
            'data/master/terms.json',
            'data/master/sentences.json',
            'data/master/topics.json',
            'data/master/custom-affixes.json',
            'data/master/custom-abbreviations.json'
          ];
          const optionalFiles = [
            'data/master/blocks.json',
            'data/master/subjects.json',
            'data/master/questions.json',
            'data/master/media-index.json'
          ];
          let total = 0;
          for (const file of requiredFiles) {
            if (!fs.existsSync(file)) throw new Error(\`Missing required data file: \${file}\`);
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(parsed)) throw new Error(\`\${file} must contain a JSON array\`);
            total += parsed.length;
            console.log(\`\${file}: \${parsed.length} records\`);
          }
          for (const file of optionalFiles) {
            if (fs.existsSync(file)) {
              const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
              if (!Array.isArray(parsed)) throw new Error(\`\${file} must contain a JSON array\`);
              total += parsed.length;
              console.log(\`\${file}: \${parsed.length} records\`);
            }
          }
          if (total === 0) throw new Error('Refusing to publish: all master data files are empty.');
          NODE

      - name: Type-check publisher source
        run: npm --prefix app run lint

      - name: Build and sign data release
        env:
          UMED_DATA_REPOSITORY_ROOT: \${{ github.workspace }}
          UMED_DATA_REPOSITORY: ${dataRepo}
          UMED_RELEASE_OUTPUT_DIR: \${{ github.workspace }}/data/releases/\${{ github.event.inputs.channel || 'stable' }}
          UMED_RELEASE_CHANNEL: \${{ github.event.inputs.channel || 'stable' }}
          UMED_RELEASE_VERSION: \${{ github.event.inputs.target_version }}
          UMED_RELEASE_SUMMARY: \${{ github.event.inputs.summary }}
          UMED_PUBLISHER_PRIVATE_KEY_PEM: \${{ secrets.UMED_PUBLISHER_PRIVATE_KEY_PEM }}
          VITE_UMED_PUBLIC_KEY_PEM: \${{ vars.VITE_UMED_PUBLIC_KEY_PEM }}
        run: |
          if [ -z "$UMED_PUBLISHER_PRIVATE_KEY_PEM" ]; then
            echo "::error::Missing secret UMED_PUBLISHER_PRIVATE_KEY_PEM in UMEDT-DATA."
            exit 1
          fi
          if [ -z "$VITE_UMED_PUBLIC_KEY_PEM" ]; then
            echo "::error::Missing variable VITE_UMED_PUBLIC_KEY_PEM in UMEDT-DATA."
            exit 1
          fi
          cd app
          ARGS=(--channel "$UMED_RELEASE_CHANNEL")
          if [ -n "$UMED_RELEASE_VERSION" ]; then ARGS+=(--version "$UMED_RELEASE_VERSION"); fi
          if [ -n "$UMED_RELEASE_SUMMARY" ]; then ARGS+=(--summary "$UMED_RELEASE_SUMMARY"); fi
          if [ "\${{ github.event.inputs.dry_run }}" = "true" ]; then ARGS+=(--dry-run); fi
          npx tsx scripts/publish-data-release.ts "\${ARGS[@]}"

      - name: Commit signed release artifacts
        if: \${{ github.event.inputs.dry_run != 'true' }}
        env:
          CHANNEL: \${{ github.event.inputs.channel || 'stable' }}
        run: |
          test -s "data/releases/$CHANNEL/manifest.json"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add "data/releases/$CHANNEL/"
          if git diff --cached --quiet; then
            echo "No release artifact changes to commit."
            exit 0
          fi
          VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/releases/$CHANNEL/manifest.json','utf8')).dataVersion)")
          git commit -m "chore(release): publish UMEDT data v$VERSION [skip ci]"
          git push origin HEAD:main
`;
}

export function generateUmedtRepoClientCode(dataRepo = 'Alssaedy50/UMEDT-DATA'): string {
  return `import type {
  ClinicalAbbreviation,
  DictionaryTerm,
  LinkedSentence,
  MorphologicalAffix,
  TopicArticle
} from '../types/lexicon';
import type { MedicalBlock, MedicalSubject, UnifiedQuizQuestion } from '../types/learningPlatform';

export interface UmedtMediaIndexEntry {
  id: string;
  fileName: string;
  relativePath: string;
  mediaType: 'image' | 'diagram' | 'pdf' | 'audio' | 'attachment';
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  linkedEntityType: 'block' | 'subject' | 'topic' | 'term' | 'global';
  linkedEntityId?: string;
  captionAr?: string;
  captionEn?: string;
  rawUrl?: string;
}

export interface UmedtRemoteMasterSnapshot {
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
  questions: UnifiedQuizQuestion[];
  mediaIndex: UmedtMediaIndexEntry[];
  fetchedAt: string;
  sourceRepo: string;
}

const DEFAULT_DATA_REPO = '${dataRepo}';

export function buildUmedtDataRawUrl(relativePath: string, dataRepo = DEFAULT_DATA_REPO, branch = 'main'): string {
  const clean = relativePath.replace(/^\\/+/, '');
  return \`https://raw.githubusercontent.com/\${dataRepo}/\${branch}/\${clean}\`;
}

async function fetchJsonArray<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Fetches live master datasets directly from UMEDT-DATA without touching local user code or DB.
 */
export async function fetchUmedtDataMasterSnapshot(
  dataRepo = DEFAULT_DATA_REPO,
  branch = 'main'
): Promise<UmedtRemoteMasterSnapshot> {
  const base = \`https://raw.githubusercontent.com/\${dataRepo}/\${branch}/data/master\`;
  const [
    blocks,
    subjects,
    topics,
    terms,
    sentences,
    customAffixes,
    customAbbreviations,
    questions,
    mediaIndex
  ] = await Promise.all([
    fetchJsonArray<MedicalBlock>(\`\${base}/blocks.json\`),
    fetchJsonArray<MedicalSubject>(\`\${base}/subjects.json\`),
    fetchJsonArray<TopicArticle>(\`\${base}/topics.json\`),
    fetchJsonArray<DictionaryTerm>(\`\${base}/terms.json\`),
    fetchJsonArray<LinkedSentence>(\`\${base}/sentences.json\`),
    fetchJsonArray<MorphologicalAffix>(\`\${base}/custom-affixes.json\`),
    fetchJsonArray<ClinicalAbbreviation>(\`\${base}/custom-abbreviations.json\`),
    fetchJsonArray<UnifiedQuizQuestion>(\`\${base}/questions.json\`),
    fetchJsonArray<UmedtMediaIndexEntry>(\`\${base}/media-index.json\`)
  ]);

  const hydratedMedia = mediaIndex.map((m) => ({
    ...m,
    rawUrl: m.rawUrl || buildUmedtDataRawUrl(m.relativePath, dataRepo, branch)
  }));

  return {
    blocks,
    subjects,
    topics,
    terms,
    sentences,
    customAffixes,
    customAbbreviations,
    questions,
    mediaIndex: hydratedMedia,
    fetchedAt: new Date().toISOString(),
    sourceRepo: dataRepo
  };
}

/**
 * Non-destructive merge helper:
 * Preserves local user favorite flags, SRS review state, and study counts while applying remote updates.
 */
export function mergeTermsPreservingUserProgress(
  localTerms: DictionaryTerm[],
  remoteTerms: DictionaryTerm[]
): DictionaryTerm[] {
  const map = new Map<string, DictionaryTerm>(localTerms.map((t) => [t.id, t]));
  for (const incoming of remoteTerms) {
    const existing = map.get(incoming.id);
    if (existing) {
      map.set(incoming.id, {
        ...incoming,
        favorite: existing.favorite,
        srsData: existing.srsData,
        lastStudiedAt: existing.lastStudiedAt,
        studyCount: existing.studyCount
      });
    } else {
      map.set(incoming.id, incoming);
    }
  }
  return Array.from(map.values());
}

export function mergeBlocksPreservingLocalOrder(
  localBlocks: MedicalBlock[],
  remoteBlocks: MedicalBlock[]
): MedicalBlock[] {
  const map = new Map<string, MedicalBlock>(localBlocks.map((b) => [b.id, b]));
  for (const incoming of remoteBlocks) {
    map.set(incoming.id, incoming);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}
`;
}

export function generateUmedtIntegrationGuideMd(
  sourceRepo = 'Alssaedy50/UMEDT',
  dataRepo = 'Alssaedy50/UMEDT-DATA'
): string {
  return `# دليل ربط ${sourceRepo} مع مستودع البيانات ${dataRepo}

## الهدف
فصل البيانات الطبية القابلة للتحديث (البلوكات، المواد، المواضيع، المصطلحات، الجمل، السوابق، الاختصارات، الأسئلة، والملحقات) داخل مستودع **${dataRepo}** بحيث يمكن نشر التحديثات باستمرار دون تعديل كود **${sourceRepo}** أو المساس ببيانات المستخدم المحلية.

## الملفات المضافة/المحدثة غير الهدّامة في ${sourceRepo}
1. \`src/services/umedtDataRepoClient.ts\`
   - يقرأ ملفات \`data/master/*.json\` و \`data/media/*\` من \`https://raw.githubusercontent.com/${dataRepo}/main/...\`.
   - يدمج المصطلحات مع الحفاظ الكامل على \`favorite\` و \`srsData\` و \`studyCount\` الخاصة بالمستخدم.
2. \`docs/UMEDT-DATA_SEPARATION.md\`
   - هذا الدليل التوثيقي لفصل المهام بين المستودعين.

## خطوات التفعيل في UMEDT
- انشر البيانات عبر **UMEDT Data Hub** إلى \`${dataRepo}\`.
- أضف \`src/services/umedtDataRepoClient.ts\` إلى \`${sourceRepo}\` (أو افتح Pull Request مباشرة من داخل Hub).
- تأكد من أن \`VITE_UMED_MANIFEST_URL\` يشير إلى:
  \`https://raw.githubusercontent.com/${dataRepo}/main/data/releases/stable/manifest.json\`
`;
}

export interface RepoPatchItem {
  path: string;
  content: string;
  descriptionAr: string;
}

export function getUmedtIntegrationPatchFiles(
  sourceRepo = 'Alssaedy50/UMEDT',
  dataRepo = 'Alssaedy50/UMEDT-DATA'
): RepoPatchItem[] {
  return [
    {
      path: 'src/services/umedtDataRepoClient.ts',
      content: generateUmedtRepoClientCode(dataRepo),
      descriptionAr:
        'عميل جلب ودمج آمن يقرأ البلوكات والمصطلحات والملحقات من UMEDT-DATA مع الحفاظ على المفضلة وSRS.'
    },
    {
      path: 'docs/UMEDT-DATA_SEPARATION.md',
      content: generateUmedtIntegrationGuideMd(sourceRepo, dataRepo),
      descriptionAr: 'دليل توثيق معمارية فصل البيانات عن الكود بين UMEDT و UMEDT-DATA.'
    }
  ];
}
