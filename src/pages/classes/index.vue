<script setup lang="ts">
import { $api } from '@/utils/api'
import { YEAR_LEVEL_OPTIONS } from '@/utils/constants'
import Papa from 'papaparse'

definePage({
  meta: {
    action: 'read',
    subject: 'classes',
    allowedRoles: ['administrator'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface Course {
  id: number
  courseCode: string
  courseName: string
}

interface ClassSection {
  id: number
  section: string[]
  program_id: { id: number; programCode: string } | number | null
}

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
}

interface Teacher {
  id: number
  first_name: string
  middle_name: string
  last_name: string
  position: string
}

interface ClassItem {
  id?: number
  acadTerm_id: number | AcademicTerm | null
  course_id: number | Course | null
  section: string
  student_id?: number[]
  department_id: number[]
  teacher_id?: number | Teacher | null
  year_level?: string
}

interface ImportedStudent {
  studentNo: string
  lastName: string
  firstName: string
  middleInitial: string
  gender: string
  email: string
  yearLevel: string
  programSection: string
}

interface ParsedClassData {
  semester: string
  schoolYear: string
  courseCode: string
  courseName: string
  section: string
  teacherName: string
  students: ImportedStudent[]
}

// State
const classes = ref<ClassItem[]>([])
const academicTerms = ref<AcademicTerm[]>([])
const courses = ref<Course[]>([])
const classSections = ref<ClassSection[]>([])
const departments = ref<Department[]>([])
const teachers = ref<Teacher[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedClass = ref<ClassItem | null>(null)

const form = ref({
  id: undefined as number | undefined,
  acadTerm_id: null as number | null,
  course_id: null as number | null,
  section: '',
  department_id: null as number | null,
  teacher_id: null as number | null,
  year_level: null as string | null,
})

const search = ref('')
const departmentFilter = ref<number | null>(null)

// Router
const router = useRouter()

// Import state
const isImportDialogOpen = ref(false)
const importFile = ref<File | null>(null)
const parsedImportData = ref<ParsedClassData | null>(null)
const isParsingFile = ref(false)
const isImporting = ref(false)
const importError = ref('')
const importStep = ref<'upload' | 'preview' | 'result'>('upload')
const importResult = ref<{ success: boolean; message: string; details?: string[] }>({ success: false, message: '' })
const selectedAcadTermForImport = ref<number | null>(null)
const selectedDepartmentForImport = ref<number | null>(null)
const selectedTeacherForImport = ref<number | null>(null)
const selectedYearLevelForImport = ref<string | null>(null)

// Table headers
const headers = [
  { title: 'Section', key: 'section', sortable: true },
  { title: 'Course', key: 'course', sortable: true },
  { title: 'Year', key: 'year_level', sortable: true },
  { title: 'Teacher', key: 'teacher', sortable: true },
  { title: 'Department', key: 'department', sortable: false },
  { title: 'Academic Term', key: 'acadTerm', sortable: true },
  { title: 'Students', key: 'studentCount', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get year level display
const getYearLevelDisplay = (yearLevel: string | undefined): string => {
  if (!yearLevel) return '-'
  return yearLevel
}

// Get academic term display
const getAcademicTerm = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return `${classItem.acadTerm_id.schoolYear} - ${classItem.acadTerm_id.semester}`

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term ? `${term.schoolYear} - ${term.semester}` : ''
}

// Get academic term status
const getAcademicTermStatus = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return classItem.acadTerm_id.status

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term?.status
}

// Get course display
const getCourse = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseCode

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseCode
}

// Get course full name for tooltip
const getCourseName = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseName

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseName || ''
}

// Get department display
const getDepartment = (classItem: ClassItem): string => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return ''

  const item = classItem.department_id[0]
  let deptId: number | null = null

  // Handle different Directus relationship structures
  if (typeof item === 'number') {
    deptId = item
  }
  else if (typeof item === 'object' && item !== null) {
    deptId = (item as any).Department_id || (item as any).id || null
  }

  if (deptId) {
    const dept = departments.value.find(d => d.id === deptId)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return dept.name.programCode
  }

  return ''
}

// Get student count - handles junction table structure with deduplication
const getStudentCount = (classItem: ClassItem): number => {
  if (!classItem.student_id || !Array.isArray(classItem.student_id))
    return 0

  // Extract unique student IDs from junction table to avoid duplicates
  const uniqueStudentIds = new Set<number>()

  for (const item of classItem.student_id) {
    let studentId: number | null = null

    if (typeof item === 'number') {
      studentId = item
    }
    else if (typeof item === 'object' && item !== null) {
      studentId = item.students_id || item.id || null
    }

    if (studentId !== null) {
      uniqueStudentIds.add(studentId)
    }
  }

  return uniqueStudentIds.size
}

// Get selected department title for display
const selectedDepartmentTitle = computed(() => {
  if (!form.value.department_id) return ''
  const dept = departmentOptions.value.find(d => d.id === form.value.department_id)
  return dept?.title || ''
})

// Computed for department selection with proper object binding
const selectedDepartment = computed({
  get: () => {
    if (!form.value.department_id) return null
    return departmentOptions.value.find(d => d.id === form.value.department_id) || null
  },
  set: (val) => {
    form.value.department_id = val?.id || null
  },
})

// Get available sections based on selected department
const availableSections = computed(() => {
  const sections: string[] = []

  // Get program code from selected department
  const selectedProgramCode = selectedDepartmentTitle.value

  for (const cs of classSections.value) {
    if (cs.section && Array.isArray(cs.section)) {
      let programCode = ''
      if (typeof cs.program_id === 'object' && cs.program_id !== null)
        programCode = cs.program_id.programCode

      // If department is selected, only show sections for that program
      if (selectedProgramCode && programCode !== selectedProgramCode)
        continue

      for (const sec of cs.section) {
        const fullSection = programCode ? `${programCode}${sec}` : sec
        if (!sections.includes(fullSection))
          sections.push(fullSection)
      }
    }
  }
  return sections.sort()
})

// Get academic terms for dropdown
const academicTermOptions = computed(() => {
  return academicTerms.value.map(term => ({
    id: term.id,
    title: `${term.schoolYear} - ${term.semester}`,
    status: term.status,
  }))
})

// Get departments formatted for dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '-',
    subtitle: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
  }))
})

// Get department ID from class item for filtering
const getClassDepartmentId = (classItem: ClassItem): number | null => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return null

  const item = classItem.department_id[0]

  if (typeof item === 'number')
    return item
  if (typeof item === 'object' && item !== null)
    return (item as any).Department_id || (item as any).id || null

  return null
}

// Filtered classes by department
const filteredClasses = computed(() => {
  if (!departmentFilter.value)
    return classes.value

  return classes.value.filter(classItem => getClassDepartmentId(classItem) === departmentFilter.value)
})

// Watch for department changes to reset section
watch(() => form.value.department_id, () => {
  // Clear section when department changes (only if not editing)
  if (!isEditing.value)
    form.value.section = ''
})

// Get courses formatted for dropdown
const courseOptions = computed(() => {
  return courses.value.map(course => ({
    id: course.id,
    title: course.courseCode,
    subtitle: course.courseName,
  }))
})

// Get teachers formatted for dropdown
const teacherOptions = computed(() => {
  return teachers.value.map(teacher => ({
    id: teacher.id,
    title: `${teacher.last_name}, ${teacher.first_name}${teacher.middle_name ? ` ${teacher.middle_name.charAt(0)}.` : ''}`,
    subtitle: teacher.position || '',
  }))
})

// Get teacher display name
const getTeacher = (classItem: ClassItem): string => {
  if (!classItem.teacher_id)
    return ''
  if (typeof classItem.teacher_id === 'object' && classItem.teacher_id !== null) {
    const t = classItem.teacher_id
    return `${t.last_name}, ${t.first_name}${t.middle_name ? ` ${t.middle_name.charAt(0)}.` : ''}`
  }
  const teacher = teachers.value.find(t => t.id === classItem.teacher_id)
  if (teacher)
    return `${teacher.last_name}, ${teacher.first_name}${teacher.middle_name ? ` ${teacher.middle_name.charAt(0)}.` : ''}`
  return ''
}

// Fetch classes from Directus
const fetchClasses = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['*', 'acadTerm_id.*', 'course_id.*', 'department_id.*', 'student_id.*', 'teacher_id.*'],
      },
    })

    classes.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch academic terms (only active)
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        fields: ['id', 'schoolYear', 'semester', 'status'],
        filter: { status: { _eq: 'Active' } },
        sort: '-schoolYear',
      },
    })

    academicTerms.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch courses
const fetchCourses = async () => {
  try {
    const res = await $api('/items/courses', {
      params: {
        fields: ['id', 'courseCode', 'courseName'],
        sort: 'courseCode',
      },
    })

    courses.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch courses:', error)
  }
}

// Fetch class sections
const fetchClassSections = async () => {
  try {
    const res = await $api('/items/ClassSection', {
      params: {
        fields: ['id', 'section', 'program_id.id', 'program_id.programCode'],
      },
    })

    classSections.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch class sections:', error)
  }
}

// Fetch departments
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
      },
    })

    departments.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

// Fetch teachers
const fetchTeachers = async () => {
  try {
    const res = await $api('/items/Teachers', {
      params: {
        fields: ['id', 'first_name', 'middle_name', 'last_name', 'position'],
        sort: 'last_name',
      },
    })

    teachers.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
  }
}

// Open dialog for creating new class
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    acadTerm_id: null,
    course_id: null,
    section: '',
    department_id: null,
    teacher_id: null,
    year_level: null,
  }
  isDialogOpen.value = true
}

// Get department option by ID
const getDepartmentOption = (deptId: number) => {
  return departmentOptions.value.find(d => d.id === deptId) || null
}

// Open dialog for editing class
const openEditDialog = (classItem: ClassItem) => {
  isEditing.value = true

  // Extract IDs from relationships
  const acadTermId = typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null
    ? classItem.acadTerm_id.id
    : classItem.acadTerm_id

  const courseId = typeof classItem.course_id === 'object' && classItem.course_id !== null
    ? classItem.course_id.id
    : classItem.course_id

  const teacherId = typeof classItem.teacher_id === 'object' && classItem.teacher_id !== null
    ? classItem.teacher_id.id
    : classItem.teacher_id

  // Get first department ID from junction table (Department_id with capital D)
  let deptId: number | null = null
  if (classItem.department_id && classItem.department_id.length > 0) {
    const firstDept = classItem.department_id[0]
    if (typeof firstDept === 'object' && firstDept !== null) {
      // Junction table structure: { id, classes_id, Department_id }
      deptId = (firstDept as any).Department_id || (firstDept as any).id || null
    }
    else {
      deptId = firstDept as number
    }
  }

  form.value = {
    id: classItem.id,
    acadTerm_id: acadTermId,
    course_id: courseId,
    section: classItem.section,
    department_id: deptId,
    teacher_id: teacherId ?? null,
    year_level: classItem.year_level || null,
  }

  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (classItem: ClassItem) => {
  selectedClass.value = classItem
  isDeleteDialogOpen.value = true
}

// Save class (create or update)
const saveClass = async () => {
  try {
    const body: any = {
      acadTerm_id: form.value.acadTerm_id,
      course_id: form.value.course_id,
      section: form.value.section,
      teacher_id: form.value.teacher_id,
      year_level: form.value.year_level,
    }

    // Handle department_id M2M - Directus expects junction table structure
    if (form.value.department_id) {
      body.department_id = [{ Department_id: form.value.department_id }]
    }
    else {
      body.department_id = []
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/classes/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/classes', {
        method: 'POST',
        body,
      })
    }

    // Assign teacher to department if they don't have one assigned
    if (form.value.teacher_id && form.value.department_id) {
      const hasDept = await checkTeacherHasDepartment(form.value.teacher_id)
      if (!hasDept) {
        await assignTeacherToDepartment(form.value.teacher_id, form.value.department_id)
      }
    }

    isDialogOpen.value = false
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to save class:', error)
  }
}

// Delete class (keeps students but removes their class association)
const deleteClass = async () => {
  if (!selectedClass.value?.id)
    return

  try {
    const classId = selectedClass.value.id

    // First, fetch the class with student IDs
    const classRes = await $api(`/items/classes/${classId}`, {
      params: {
        fields: ['student_id.students_id'],
      },
    })

    // Extract student IDs from junction table
    const studentIds: number[] = (classRes.data?.student_id || [])
      .map((item: any) => item.students_id?.id || item.students_id || item.id)
      .filter((id: any) => typeof id === 'number')

    // Remove class association from each student (instead of deleting students)
    if (studentIds.length > 0) {
      for (const studentId of studentIds) {
        try {
          // Get current class associations for this student
          const studentRes = await $api(`/items/students/${studentId}`, {
            params: { fields: ['class_id.*'] },
          })

          // Get all class IDs except the one being deleted
          const remainingClassIds: number[] = (studentRes.data?.class_id || [])
            .map((item: any) => item.classes_id || item.id || item)
            .filter((id: any) => typeof id === 'number' && id !== classId)

          // Update student with remaining class associations
          await $api(`/items/students/${studentId}`, {
            method: 'PATCH',
            body: {
              class_id: remainingClassIds.length > 0
                ? remainingClassIds.map(id => ({ classes_id: id }))
                : [],
            },
          })
        }
        catch (err) {
          console.error(`Failed to update student ${studentId}:`, err)
        }
      }
    }

    // Delete the class
    await $api(`/items/classes/${classId}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedClass.value = null
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to delete class:', error)
  }
}

// Navigate to class detail page
const viewClassDetails = (classItem: ClassItem) => {
  if (classItem.id)
    router.push(`/classes/${classItem.id}`)
}

// === IMPORT FUNCTIONS ===

// Open import dialog
const openImportDialog = () => {
  importFile.value = null
  parsedImportData.value = null
  importError.value = ''
  importStep.value = 'upload'
  importResult.value = { success: false, message: '' }
  selectedAcadTermForImport.value = null
  selectedDepartmentForImport.value = null
  selectedTeacherForImport.value = null
  selectedYearLevelForImport.value = null
  isImportDialogOpen.value = true
}

// Handle file selection
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    importFile.value = input.files[0]
    importError.value = ''
  }
}

// Parse the CSV file
const parseImportFile = () => {
  if (!importFile.value) {
    importError.value = 'Please select a file first'
    return
  }

  isParsingFile.value = true
  importError.value = ''

  Papa.parse(importFile.value, {
    complete: (results: Papa.ParseResult<string[]>) => {
      try {
        const parsed = extractClassData(results.data)
        parsedImportData.value = parsed
        importStep.value = 'preview'

        // Auto-detect year level from section (e.g., "BSCS-2A" -> "2nd Year")
        const detectedYearLevel = detectYearLevelFromSection(parsed.section)
        if (detectedYearLevel) {
          selectedYearLevelForImport.value = detectedYearLevel
        }
      }
      catch (err: any) {
        importError.value = err.message || 'Failed to parse file'
      }
      finally {
        isParsingFile.value = false
      }
    },
    error: (error: Error) => {
      importError.value = error.message || 'Failed to read file'
      isParsingFile.value = false
    },
  })
}

// Extract class data from parsed CSV rows
const extractClassData = (rows: string[][]): ParsedClassData => {
  const data: ParsedClassData = {
    semester: '',
    schoolYear: '',
    courseCode: '',
    courseName: '',
    section: '',
    teacherName: '',
    students: [],
  }

  let studentStartIndex = -1
  let sectionFoundAtIndex = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0)
      continue

    const firstCell = (row[0] || '').trim()
    const secondCell = (row[1] || '').trim()

    // Look for semester line (e.g., "FIRST SEMESTER 2025-2026")
    if (firstCell.match(/^(FIRST|SECOND|THIRD|SUMMER)\s+SEMESTER\s+\d{4}-\d{4}$/i)) {
      const semesterMatch = firstCell.match(/^(FIRST|SECOND|THIRD|SUMMER)\s+SEMESTER\s+(\d{4}-\d{4})$/i)
      if (semesterMatch) {
        data.semester = semesterMatch[1].charAt(0).toUpperCase() + semesterMatch[1].slice(1).toLowerCase() + ' Semester'
        data.schoolYear = semesterMatch[2]
      }
    }

    // Look for course code line - check both firstCell and secondCell
    // Supports formats like "CS101 - Introduction to Computing" in first OR second column
    const courseCellCandidate = firstCell.match(/^[A-Z]{2,4}\d{2,4}\s*-/i) ? firstCell
      : secondCell.match(/^[A-Z]{2,4}\d{2,4}\s*-/i) ? secondCell : null
    if (courseCellCandidate) {
      const courseMatch = courseCellCandidate.match(/^([A-Z]{2,4}\d{2,4})\s*-\s*(.+)$/i)
      if (courseMatch) {
        data.courseCode = courseMatch[1].trim()
        data.courseName = courseMatch[2].trim()
      }
    }

    // Look for section line - check both firstCell and secondCell
    // Supports formats like "BSCS-2A" in first OR second column
    const sectionCellCandidate = firstCell.match(/^[A-Z]{2,6}-?\d?[A-Z]$/i) ? firstCell
      : secondCell.match(/^[A-Z]{2,6}-?\d?[A-Z]$/i) ? secondCell : null
    if (sectionCellCandidate && !data.section) {
      data.section = sectionCellCandidate.trim()
      sectionFoundAtIndex = i
    }

    // Look for teacher name (appears after section, before student header)
    // Teacher name is just a name like "John Doe" - check in secondCell or firstCell
    if (sectionFoundAtIndex > 0 && i > sectionFoundAtIndex && !data.teacherName && studentStartIndex < 0) {
      const potentialName = secondCell || firstCell
      // Check if it looks like a name (contains letters, spaces, no special patterns like course codes)
      if (potentialName && potentialName.match(/^[A-Za-z]+(\s+[A-Za-z]+)+$/) && !potentialName.match(/^No\.?$/i)) {
        data.teacherName = potentialName
      }
    }

    // Look for student data header row
    if (firstCell.match(/^No\.?$/i) && (secondCell.match(/student/i) || (row[2] || '').trim().match(/last/i))) {
      studentStartIndex = i + 1
      continue
    }

    // Parse student rows (after header)
    if (studentStartIndex > 0 && i >= studentStartIndex) {
      const rowNum = firstCell
      const studentNo = secondCell
      const lastName = (row[2] || '').trim()
      const firstName = (row[3] || '').trim()
      const middleInitial = (row[4] || '').trim()

      // Handle multiple formats:
      // Old format (6 cols): No, StudentNo, LastName, FirstName, MI, Section
      // Medium format (8 cols): No, StudentNo, LastName, FirstName, MI, Gender, Email, Section
      // New format (9 cols): No, StudentNo, LastName, FirstName, MI, Gender, Email, YearLevel, Section
      let gender = ''
      let email = ''
      let yearLevel = ''
      let programSection = ''

      const col5 = (row[5] || '').trim()
      const col6 = (row[6] || '').trim()
      const col7 = (row[7] || '').trim()
      const col8 = (row[8] || '').trim()

      if (col8) {
        // New format (9 cols): No, StudentNo, LastName, FirstName, MI, Gender, Email, YearLevel, Section
        gender = col5
        email = col6
        yearLevel = col7 // Direct string: "1st Year", "2nd Year", etc.
        programSection = col8
      }
      else if (col6.includes('@') || (col5 && col7)) {
        // Medium format (8 cols): No, StudentNo, LastName, FirstName, MI, Gender, Email, Section
        gender = col5
        email = col6
        programSection = col7
      }
      else {
        // Old format (6 cols): No, StudentNo, LastName, FirstName, MI, Section
        programSection = col5
      }

      // Validate this is a student row (has a number and student number pattern)
      // More flexible regex: allows various student number formats (letters, numbers, dashes)
      if (rowNum.match(/^\d+$/) && studentNo.match(/^[A-Za-z0-9]+-?[A-Za-z0-9]+$/)) {
        data.students.push({
          studentNo,
          lastName,
          firstName,
          middleInitial,
          gender,
          email,
          yearLevel,
          programSection,
        })
      }
    }
  }

  if (!data.courseCode)
    throw new Error('Could not find course information in the file')
  if (!data.section)
    throw new Error('Could not find section information in the file')
  if (data.students.length === 0)
    throw new Error('No student data found in the file')

  return data
}

// Extract program code from section (e.g., "BSCS 2A" -> "BSCS")
const extractProgramCode = (section: string): string => {
  const match = section.match(/^([A-Z]{2,6})/i)
  return match ? match[1].toUpperCase() : ''
}

// Find matching department by program code
const findDepartmentByProgramCode = (programCode: string): number | null => {
  const dept = departments.value.find(d => {
    if (typeof d.name === 'object' && d.name !== null)
      return d.name.programCode?.toUpperCase() === programCode.toUpperCase()
    return false
  })
  return dept?.id
}

// Extract section suffix from full section (e.g., "BSCS-2A" -> "2A", "BSCS2A" -> "2A")
// Section format should be: 1A, 2A, 2B, 3C, etc.
const extractSectionSuffix = (fullSection: string, programCode: string): string => {
  // Remove program code prefix (with or without dash/space)
  const pattern = new RegExp(`^${programCode}[-\\s]?`, 'i')
  const suffix = fullSection.replace(pattern, '').trim()

  // Validate and extract section in format like 1A, 2A, 2B, 3C (number + letter)
  const sectionMatch = suffix.match(/^(\d+[A-Z])$/i)
  if (sectionMatch) {
    return sectionMatch[1].toUpperCase()
  }

  // If the suffix itself looks like a valid section format, return it
  if (/^\d+[A-Z]$/i.test(suffix)) {
    return suffix.toUpperCase()
  }

  // Try to extract from the full section if program code removal didn't work
  const fullMatch = fullSection.match(/(\d+[A-Z])$/i)
  if (fullMatch) {
    return fullMatch[1].toUpperCase()
  }

  return ''
}

// Detect year level from section (e.g., "BSCS-2A" -> "2nd Year", "BSIT1B" -> "1st Year")
const detectYearLevelFromSection = (section: string): string | null => {
  // Extract the numeric part from section (e.g., "BSCS-2A" -> "2", "BSIT1B" -> "1")
  const match = section.match(/(\d+)[A-Z]$/i)
  if (match) {
    const yearNum = parseInt(match[1])
    const yearLevelMap: Record<number, string> = {
      1: '1st Year',
      2: '2nd Year',
      3: '3rd Year',
      4: '4th Year',
    }
    return yearLevelMap[yearNum] || null
  }
  return null
}

// Ensure section exists in ClassSection table for the given program
const ensureSectionExists = async (section: string, departmentId: number): Promise<void> => {
  // Get the program code from the department
  const dept = departments.value.find(d => d.id === departmentId)
  if (!dept || typeof dept.name !== 'object' || dept.name === null) return

  const programCode = dept.name.programCode

  // Extract the section suffix (e.g., "BSCS-2A" -> "2A")
  const sectionSuffix = extractSectionSuffix(section, programCode)
  if (!sectionSuffix) return

  // Find the ClassSection for this program
  const classSection = classSections.value.find(cs => {
    if (typeof cs.program_id === 'object' && cs.program_id !== null)
      return cs.program_id.programCode?.toUpperCase() === programCode.toUpperCase()
    return false
  })

  if (classSection) {
    // Check if section suffix already exists
    const sectionExists = classSection.section.some(s =>
      s.toUpperCase() === sectionSuffix.toUpperCase(),
    )

    if (!sectionExists) {
      // Add the new section to existing ClassSection
      const updatedSections = [...classSection.section, sectionSuffix.toUpperCase()]

      await $api(`/items/ClassSection/${classSection.id}`, {
        method: 'PATCH',
        body: {
          section: updatedSections,
        },
      })

      // Refresh class sections
      await fetchClassSections()
    }
  }
  else {
    // Find the program ID
    const programRes = await $api('/items/programs', {
      params: {
        filter: { programCode: { _eq: programCode } },
        fields: ['id'],
      },
    })

    if (programRes.data && programRes.data.length > 0) {
      // Create new ClassSection for this program
      await $api('/items/ClassSection', {
        method: 'POST',
        body: {
          program_id: programRes.data[0].id,
          section: [sectionSuffix.toUpperCase()],
        },
      })

      // Refresh class sections
      await fetchClassSections()
    }
  }
}

// Find or create course
const findOrCreateCourse = async (courseCode: string, courseName: string): Promise<number> => {
  // First try to find existing course
  const existingCourse = courses.value.find(c =>
    c.courseCode.toUpperCase() === courseCode.toUpperCase(),
  )

  if (existingCourse)
    return existingCourse.id

  // Create new course
  const res = await $api('/items/courses', {
    method: 'POST',
    body: {
      courseCode,
      courseName,
    },
  })

  // Refresh courses list
  await fetchCourses()

  return res.data.id
}

// Find academic term by semester and school year
const findAcademicTerm = (semester: string, schoolYear: string): number | null => {
  const term = academicTerms.value.find(t =>
    t.semester.toLowerCase().includes(semester.toLowerCase().replace(' semester', ''))
    && t.schoolYear === schoolYear,
  )
  return term?.id
}

// Create or find student
const findOrCreateStudent = async (studentData: ImportedStudent, departmentId: number | null): Promise<number> => {
  // Try to find existing student by student number
  try {
    const existingRes = await $api('/items/students', {
      params: {
        filter: {
          student_number: { _eq: studentData.studentNo },
        },
        fields: ['id'],
      },
    })

    // If student exists, just return their ID (don't update department)
    if (existingRes.data && existingRes.data.length > 0)
      return existingRes.data[0].id
  }
  catch (error) {
    console.error('Error checking existing student:', error)
  }

  // Create new student with department set only on initial creation
  const studentBody: any = {
    student_number: studentData.studentNo,
    first_name: studentData.firstName,
    middle_name: studentData.middleInitial || '',
    last_name: studentData.lastName,
    email: studentData.email || `${studentData.studentNo}@student.edu`,
    gender: studentData.gender || '',
    birthdate: '',
    is_active: 'Active',
  }

  if (departmentId)
    studentBody.deparment_id = departmentId

  if (studentData.yearLevel)
    studentBody.year_level = studentData.yearLevel // String: "1st Year", "2nd Year", etc.

  const res = await $api('/items/students', {
    method: 'POST',
    body: studentBody,
  })

  return res.data.id
}

// Check if teacher has a department assigned
const checkTeacherHasDepartment = async (teacherId: number): Promise<boolean> => {
  try {
    // Check all departments to see if this teacher is in any
    const deptRes = await $api('/items/Department', {
      params: {
        fields: ['id', 'teacher_id.Teachers_id'],
      },
    })

    if (deptRes.data) {
      for (const dept of deptRes.data) {
        const teacherIds = dept.teacher_id || []
        const isAssigned = teacherIds.some((t: any) => {
          const tId = typeof t === 'object' ? (t.Teachers_id || t.id) : t
          return tId === teacherId
        })
        if (isAssigned) return true
      }
    }
    return false
  }
  catch (error) {
    console.error('Error checking teacher department:', error)
    return false
  }
}

// Assign teacher to department if not already assigned
const assignTeacherToDepartment = async (teacherId: number, departmentId: number): Promise<void> => {
  try {
    // First check if already assigned
    const hasDept = await checkTeacherHasDepartment(teacherId)
    if (hasDept) return // Already has a department, don't change

    // Get current department data
    const deptRes = await $api(`/items/Department/${departmentId}`, {
      params: {
        fields: ['id', 'teacher_id.id', 'teacher_id.Teachers_id'],
      },
    })

    if (deptRes.data) {
      // Preserve existing entries and add new one
      const updatedTeacherIds = [
        ...(deptRes.data.teacher_id || []).map((t: any) => {
          if (typeof t === 'object' && t.id) {
            return { id: t.id, Teachers_id: t.Teachers_id }
          }
          return { Teachers_id: typeof t === 'number' ? t : t.Teachers_id }
        }),
        { Teachers_id: teacherId },
      ]

      await $api(`/items/Department/${departmentId}`, {
        method: 'PATCH',
        body: { teacher_id: updatedTeacherIds },
      })
    }
  }
  catch (error) {
    console.error('Error assigning teacher to department:', error)
  }
}

// Find or create teacher by full name
const findOrCreateTeacher = async (fullName: string): Promise<{ id: number; created: boolean }> => {
  // Parse "First Last" into first_name and last_name
  const nameParts = fullName.trim().split(/\s+/)
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  // Search for existing teacher by first + last name
  try {
    const existingRes = await $api('/items/Teachers', {
      params: {
        filter: {
          _and: [
            { first_name: { _eq: firstName } },
            { last_name: { _eq: lastName } },
          ],
        },
        fields: ['id'],
      },
    })

    if (existingRes.data && existingRes.data.length > 0) {
      return { id: existingRes.data[0].id, created: false }
    }
  }
  catch (error) {
    console.error('Error checking existing teacher:', error)
  }

  // Create new teacher with minimal data
  const createRes = await $api('/items/Teachers', {
    method: 'POST',
    body: {
      first_name: firstName,
      last_name: lastName,
      middle_name: '',
      position: 'Professor',
      gender: 'M',
      email: '',
      is_active: 'Active',
    },
  })

  // Refresh teachers list
  await fetchTeachers()

  return { id: createRes.data.id, created: true }
}

// Execute the import
const executeImport = async () => {
  if (!parsedImportData.value || !selectedAcadTermForImport.value || !selectedDepartmentForImport.value) {
    importError.value = 'Please select academic term and department'
    return
  }

  isImporting.value = true
  importError.value = ''
  const details: string[] = []

  try {
    const data = parsedImportData.value

    // Step 1: Find or create course
    details.push(`Finding/creating course: ${data.courseCode}`)
    const courseId = await findOrCreateCourse(data.courseCode, data.courseName)
    details.push(`Course ready (ID: ${courseId})`)

    // Step 1.25: Ensure section exists in ClassSection table
    details.push(`Checking if section "${data.section}" exists in ClassSection...`)
    await ensureSectionExists(data.section, selectedDepartmentForImport.value!)
    details.push(`Section ready in ClassSection table`)

    // Step 1.5: Find or create teacher from CSV, or use selected teacher
    let teacherId: number | null = null

    if (data.teacherName) {
      // Teacher name found in CSV - find or create
      details.push(`Finding/creating teacher: ${data.teacherName}`)
      const teacherResult = await findOrCreateTeacher(data.teacherName)
      teacherId = teacherResult.id
      if (teacherResult.created) {
        details.push(`Created new teacher (ID: ${teacherId})`)
      }
      else {
        details.push(`Found existing teacher (ID: ${teacherId})`)
      }
    }
    else if (selectedTeacherForImport.value) {
      // Fall back to manually selected teacher
      teacherId = selectedTeacherForImport.value
      const teacher = teacherOptions.value.find(t => t.id === teacherId)
      details.push(`Teacher selected: ${teacher?.title || teacherId}`)
    }
    else {
      details.push(`No teacher selected for this class`)
    }

    // Assign teacher to department if they don't have one assigned
    if (teacherId && selectedDepartmentForImport.value) {
      details.push(`Checking teacher's department assignment...`)
      const hasDept = await checkTeacherHasDepartment(teacherId)
      if (!hasDept) {
        await assignTeacherToDepartment(teacherId, selectedDepartmentForImport.value)
        details.push(`Assigned teacher to department`)
      }
      else {
        details.push(`Teacher already has a department assigned, keeping existing`)
      }
    }

    // Step 2: Create students
    const studentIds: number[] = []
    details.push(`Processing ${data.students.length} students...`)

    for (const student of data.students) {
      try {
        const studentId = await findOrCreateStudent(student, selectedDepartmentForImport.value)
        studentIds.push(studentId)
        details.push(`Student ${student.studentNo} ready (ID: ${studentId})`)
      }
      catch (err: any) {
        details.push(`Failed to create student ${student.studentNo}: ${err.message}`)
      }
    }

    // Step 3: Check if class already exists
    const existingClassRes = await $api('/items/classes', {
      params: {
        filter: {
          _and: [
            { section: { _eq: data.section } },
            { course_id: { _eq: courseId } },
            { acadTerm_id: { _eq: selectedAcadTermForImport.value } },
          ],
        },
        fields: ['id', 'student_id.*'],
      },
    })

    let classId: number

    if (existingClassRes.data && existingClassRes.data.length > 0) {
      // Class exists - update with new students
      classId = existingClassRes.data[0].id
      details.push(`Found existing class (ID: ${classId}), updating students...`)

      // Get existing student IDs from junction table
      const existingStudentIds: number[] = (existingClassRes.data[0].student_id || [])
        .map((item: any) => item.students_id || item.id || item)
        .filter((id: any) => typeof id === 'number')

      // Merge with new students (avoid duplicates)
      const allStudentIds = [...new Set([...existingStudentIds, ...studentIds])]

      // Update class with all students and year_level
      await $api(`/items/classes/${classId}`, {
        method: 'PATCH',
        body: {
          student_id: allStudentIds.map(id => ({ students_id: id })),
          year_level: selectedYearLevelForImport.value,
        },
      })

      details.push(`Updated class with ${allStudentIds.length} students`)
    }
    else {
      // Create new class
      details.push('Creating new class...')

      const classBody: any = {
        acadTerm_id: selectedAcadTermForImport.value,
        course_id: courseId,
        section: data.section,
        department_id: [{ Department_id: selectedDepartmentForImport.value }],
        student_id: studentIds.map(id => ({ students_id: id })),
        teacher_id: teacherId,
        year_level: selectedYearLevelForImport.value,
      }

      const classRes = await $api('/items/classes', {
        method: 'POST',
        body: classBody,
      })

      classId = classRes.data.id
      details.push(`Created class (ID: ${classId}) with ${studentIds.length} students`)
    }

    // Update students to associate them with this class
    details.push('Associating students with class...')
    for (const studentId of studentIds) {
      try {
        // Get current class associations with full junction table data
        const studentRes = await $api(`/items/students/${studentId}`, {
          params: { fields: ['class_id.*'] },
        })

        const existingEntries = studentRes.data?.class_id || []

        // Check if already associated with this class
        const alreadyAssociated = existingEntries.some((item: any) => {
          const cId = item.classes_id || item.id || item
          return cId === classId
        })

        // Add new class if not already associated
        if (!alreadyAssociated) {
          // Preserve existing junction entries (with their IDs) and add new one
          const updatedClassIds = [
            ...existingEntries.map((item: any) => {
              // Keep existing entries with their junction table IDs
              if (typeof item === 'object' && item !== null && item.id) {
                return { id: item.id, classes_id: item.classes_id }
              }
              // Handle plain class IDs
              return { classes_id: typeof item === 'number' ? item : item.classes_id || item.id }
            }),
            { classes_id: classId }, // Add new class without junction ID
          ]

          await $api(`/items/students/${studentId}`, {
            method: 'PATCH',
            body: {
              class_id: updatedClassIds,
            },
          })
        }
      }
      catch (err) {
        console.error(`Failed to associate student ${studentId} with class:`, err)
      }
    }

    importResult.value = {
      success: true,
      message: `Successfully imported class "${data.section}" with ${studentIds.length} students`,
      details,
    }
    importStep.value = 'result'

    // Refresh classes list
    await fetchClasses()
  }
  catch (err: any) {
    importResult.value = {
      success: false,
      message: err.message || 'Import failed',
      details,
    }
    importStep.value = 'result'
  }
  finally {
    isImporting.value = false
  }
}

// Reset import to start over
const resetImport = () => {
  importFile.value = null
  parsedImportData.value = null
  importError.value = ''
  importStep.value = 'upload'
  importResult.value = { success: false, message: '' }
  selectedAcadTermForImport.value = null
  selectedDepartmentForImport.value = null
  selectedTeacherForImport.value = null
  selectedYearLevelForImport.value = null
}

// Fetch data on mount
onMounted(() => {
  fetchClasses()
  fetchAcademicTerms()
  fetchCourses()
  fetchClassSections()
  fetchDepartments()
  fetchTeachers()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Class List Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search classes..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VSelect
          v-model="departmentFilter"
          :items="departmentOptions"
          item-title="title"
          item-value="id"
          label="Department"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 180px;"
        />
        <VBtn
          color="secondary"
          variant="outlined"
          prepend-icon="ri-upload-2-line"
          class="me-2"
          @click="openImportDialog"
        >
          Import
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Class
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filteredClasses"
        :search="search"
        :loading="isLoading"
        hover
        class="clickable-rows"
        @click:row="(_event: Event, { item }: { item: ClassItem }) => viewClassDetails(item)"
      >
        <template #item.section="{ item }">
          <span class="font-weight-medium text-primary">{{ item.section }}</span>
        </template>

        <template #item.course="{ item }">
          <VTooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium text-primary" style="cursor: help;">
                {{ getCourse(item) }}
              </span>
            </template>
            {{ getCourseName(item) }}
          </VTooltip>
        </template>

        <template #item.year_level="{ item }">
          <VChip
            v-if="item.year_level"
            size="small"
            variant="tonal"
            color="info"
          >
            {{ getYearLevelDisplay(item.year_level) }}
          </VChip>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.teacher="{ item }">
          <span v-if="getTeacher(item) !== '-'">{{ getTeacher(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.department="{ item }">
          <span v-if="getDepartment(item)">{{ getDepartment(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.acadTerm="{ item }">
          <div class="d-flex align-center gap-2">
            <span>{{ getAcademicTerm(item) }}</span>
            <VChip
              v-if="getAcademicTermStatus(item)"
              :color="getAcademicTermStatus(item) === 'Active' ? 'success' : getAcademicTermStatus(item) === 'Draft' ? 'warning' : 'secondary'"
              size="x-small"
              variant="tonal"
            >
              {{ getAcademicTermStatus(item) }}
            </VChip>
          </div>
        </template>

        <template #item.studentCount="{ item }">
          <span :class="getStudentCount(item) > 0 ? 'font-weight-medium' : 'text-medium-emphasis'">
            {{ getStudentCount(item) }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click.stop="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click.stop="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No classes found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="600"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Class' : 'Add New Class' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="selectedDepartment"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                return-object
                variant="outlined"
                placeholder="Select department..."
                hint="Select department first to filter sections"
                persistent-hint
                :rules="[v => !!v || 'Department is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="form.section"
                label="Section"
                :items="availableSections"
                variant="outlined"
                placeholder="Type to search sections..."
                :rules="[v => !!v || 'Section is required']"
                :disabled="!form.department_id"
                :hint="!form.department_id ? 'Select a department first' : ''"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="form.year_level"
                label="Year Level"
                :items="YEAR_LEVEL_OPTIONS"
                item-title="title"
                item-value="value"
                variant="outlined"
                placeholder="Select year level..."
              />
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.acadTerm_id"
                label="Academic Term"
                :items="academicTermOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select academic term..."
                :rules="[v => !!v || 'Academic term is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #append>
                      <VChip
                        :color="item.raw.status === 'Active' ? 'success' : item.raw.status === 'Draft' ? 'warning' : 'secondary'"
                        size="x-small"
                      >
                        {{ item.raw.status }}
                      </VChip>
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.course_id"
                label="Course"
                :items="courseOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Type to search courses..."
                :rules="[v => !!v || 'Course is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.teacher_id"
                label="Teacher"
                :items="teacherOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select teacher..."
                clearable
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!form.department_id || !form.section || !form.acadTerm_id || !form.course_id"
            @click="saveClass"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Class
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <p class="mb-3">
            Are you sure you want to delete the class <strong>{{ selectedClass?.section }}</strong>
            <template v-if="selectedClass">
              ({{ getCourse(selectedClass) }})
            </template>?
          </p>
          <VAlert
            v-if="selectedClass"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-0"
          >
            The {{ getStudentCount(selectedClass) }} student(s) enrolled in this class will be kept, but their association to this class will be removed.
          </VAlert>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            @click="deleteClass"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Import Dialog -->
    <VDialog
      v-model="isImportDialogOpen"
      max-width="800"
      persistent
    >
      <VCard>
        <VCardTitle class="d-flex align-center pa-6">
          <VIcon icon="ri-upload-2-line" class="me-2" />
          Import Class List
          <VSpacer />
          <VChip
            v-if="importStep === 'upload'"
            color="primary"
            size="small"
          >
            Step 1: Upload
          </VChip>
          <VChip
            v-else-if="importStep === 'preview'"
            color="info"
            size="small"
          >
            Step 2: Preview
          </VChip>
          <VChip
            v-else
            :color="importResult.success ? 'success' : 'error'"
            size="small"
          >
            Step 3: Result
          </VChip>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Step 1: Upload -->
          <div v-if="importStep === 'upload'">
            <VAlert
              type="info"
              variant="tonal"
              class="mb-4"
            >
              <div class="text-subtitle-2 mb-2">
                Expected CSV Format:
              </div>
              <div class="text-body-2">
                The CSV should contain: semester info, course code & name, section, and student list with columns: No., Student No., Last Name, First Name, MI, Gender, Email, Year Level, Program/Section
              </div>
            </VAlert>

            <div class="mb-4">
              <label
                for="import-file"
                class="d-block text-subtitle-2 mb-2"
              >
                Select CSV File
              </label>
              <input
                id="import-file"
                type="file"
                accept=".csv"
                class="file-input"
                @change="handleFileSelect"
              >
            </div>

            <VAlert
              v-if="importFile"
              type="success"
              variant="tonal"
              class="mb-4"
            >
              Selected file: {{ importFile.name }} ({{ Math.round(importFile.size / 1024) }} KB)
            </VAlert>

            <VAlert
              v-if="importError"
              type="error"
              variant="tonal"
              class="mb-4"
            >
              {{ importError }}
            </VAlert>
          </div>

          <!-- Step 2: Preview -->
          <div v-else-if="importStep === 'preview' && parsedImportData">
            <VRow class="mb-4">
              <VCol cols="12" md="6">
                <VCard
                  variant="outlined"
                  class="pa-4"
                >
                  <div class="text-overline text-medium-emphasis mb-1">
                    Course Information
                  </div>
                  <div class="text-h6">
                    {{ parsedImportData.courseCode }}
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ parsedImportData.courseName }}
                  </div>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  variant="outlined"
                  class="pa-4"
                >
                  <div class="text-overline text-medium-emphasis mb-1">
                    Section
                  </div>
                  <div class="text-h6">
                    {{ parsedImportData.section }}
                  </div>
                </VCard>
              </VCol>
              <VCol v-if="parsedImportData.teacherName" cols="12" md="3">
                <VCard
                  variant="outlined"
                  class="pa-4"
                >
                  <div class="text-overline text-medium-emphasis mb-1">
                    Teacher (from CSV)
                  </div>
                  <div class="text-h6">
                    {{ parsedImportData.teacherName }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    Will be created if not existing
                  </div>
                </VCard>
              </VCol>
            </VRow>

            <VRow class="mb-4">
              <VCol cols="12">
                <VSelect
                  v-model="selectedAcadTermForImport"
                  label="Academic Term *"
                  :items="academicTermOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select academic term..."
                  :hint="parsedImportData.semester && parsedImportData.schoolYear ? `Detected: ${parsedImportData.semester} ${parsedImportData.schoolYear}` : ''"
                  persistent-hint
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #append>
                        <VChip
                          :color="item.raw.status === 'Active' ? 'success' : item.raw.status === 'Draft' ? 'warning' : 'secondary'"
                          size="x-small"
                        >
                          {{ item.raw.status }}
                        </VChip>
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
            </VRow>
            <VRow class="mb-4">
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedDepartmentForImport"
                  label="Department *"
                  :items="departmentOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select department..."
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #subtitle>
                        {{ item.raw.subtitle }}
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedYearLevelForImport"
                  label="Year Level"
                  :items="YEAR_LEVEL_OPTIONS"
                  item-title="title"
                  item-value="value"
                  variant="outlined"
                  placeholder="Select year level..."
                  clearable
                  :hint="selectedYearLevelForImport ? 'Auto-detected from section' : ''"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="!parsedImportData.teacherName" cols="12" md="4">
                <VSelect
                  v-model="selectedTeacherForImport"
                  label="Teacher"
                  :items="teacherOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select teacher..."
                  clearable
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #subtitle>
                        {{ item.raw.subtitle }}
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
            </VRow>

            <VCard variant="outlined">
              <VCardTitle class="text-subtitle-1 pa-4 pb-2">
                Students to Import ({{ parsedImportData.students.length }})
              </VCardTitle>
              <VDivider />
              <VTable
                density="compact"
                class="text-no-wrap"
              >
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Student No.</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>M.I.</th>
                    <th>Gender</th>
                    <th>Email</th>
                    <th>Year</th>
                    <th>Section</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(student, index) in parsedImportData.students.slice(0, 10)"
                    :key="index"
                  >
                    <td>{{ index + 1 }}</td>
                    <td>{{ student.studentNo }}</td>
                    <td>{{ student.lastName }}</td>
                    <td>{{ student.firstName }}</td>
                    <td>{{ student.middleInitial || '-' }}</td>
                    <td>{{ student.gender || '-' }}</td>
                    <td>{{ student.email || '-' }}</td>
                    <td>{{ student.yearLevel || '-' }}</td>
                    <td>{{ student.programSection }}</td>
                  </tr>
                  <tr v-if="parsedImportData.students.length > 10">
                    <td
                      colspan="9"
                      class="text-center text-medium-emphasis"
                    >
                      ... and {{ parsedImportData.students.length - 10 }} more students
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </VCard>

            <VAlert
              v-if="importError"
              type="error"
              variant="tonal"
              class="mt-4"
            >
              {{ importError }}
            </VAlert>
          </div>

          <!-- Step 3: Result -->
          <div v-else-if="importStep === 'result'">
            <VAlert
              :type="importResult.success ? 'success' : 'error'"
              variant="tonal"
              class="mb-4"
            >
              <div class="text-subtitle-1 font-weight-medium mb-1">
                {{ importResult.success ? 'Import Successful!' : 'Import Failed' }}
              </div>
              <div class="text-body-2">
                {{ importResult.message }}
              </div>
            </VAlert>

            <VExpansionPanels
              v-if="importResult.details && importResult.details.length > 0"
              variant="outlined"
            >
              <VExpansionPanel title="Import Details">
                <VExpansionPanelText>
                  <div
                    class="import-log pa-2"
                    style="max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; background: #f5f5f5; border-radius: 4px;"
                  >
                    <div
                      v-for="(detail, index) in importResult.details"
                      :key="index"
                      class="mb-1"
                    >
                      {{ detail }}
                    </div>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VBtn
            v-if="importStep !== 'upload'"
            variant="text"
            @click="resetImport"
          >
            <VIcon icon="ri-arrow-left-line" class="me-1" />
            Start Over
          </VBtn>
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isImportDialogOpen = false"
          >
            {{ importStep === 'result' ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="importStep === 'upload'"
            color="primary"
            :loading="isParsingFile"
            :disabled="!importFile"
            @click="parseImportFile"
          >
            Parse File
          </VBtn>
          <VBtn
            v-if="importStep === 'preview'"
            color="primary"
            :loading="isImporting"
            :disabled="!selectedAcadTermForImport || !selectedDepartmentForImport"
            @click="executeImport"
          >
            Import Class
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.file-input {
  display: block;
  inline-size: 100%;
  padding: 12px;
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.file-input:hover {
  border-color: rgb(var(--v-theme-primary));
}

.import-log {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.clickable-rows :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.clickable-rows :deep(tbody tr:hover) {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}
</style>
