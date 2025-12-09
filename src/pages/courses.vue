<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'courses',
  },
})

interface Course {
  id?: number
  courseCode: string
  courseName: string
  date_created?: string
  date_updated?: string | null
}

// State
const courses = ref<Course[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedCourse = ref<Course | null>(null)

const form = ref<Course>({
  courseCode: '',
  courseName: '',
})

const search = ref('')

// Table headers
const headers = [
  { title: 'Course Code', key: 'courseCode', sortable: true },
  { title: 'Course Name', key: 'courseName', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Fetch courses from Directus
const fetchCourses = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/courses', {
      params: {
        sort: '-date_created',
      },
    })

    courses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch courses:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Open dialog for creating new course
const openCreateDialog = () => {
  isEditing.value = false
  form.value = { courseCode: '', courseName: '' }
  isDialogOpen.value = true
}

// Open dialog for editing course
const openEditDialog = (course: Course) => {
  isEditing.value = true
  form.value = { ...course }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (course: Course) => {
  selectedCourse.value = course
  isDeleteDialogOpen.value = true
}

// Save course (create or update)
const saveCourse = async () => {
  try {
    if (isEditing.value && form.value.id) {
      // Update existing course
      await $api(`/items/courses/${form.value.id}`, {
        method: 'PATCH',
        body: {
          courseCode: form.value.courseCode,
          courseName: form.value.courseName,
        },
      })
    }
    else {
      // Create new course
      await $api('/items/courses', {
        method: 'POST',
        body: {
          courseCode: form.value.courseCode,
          courseName: form.value.courseName,
        },
      })
    }

    isDialogOpen.value = false
    await fetchCourses()
  }
  catch (error) {
    console.error('Failed to save course:', error)
  }
}

// Delete course
const deleteCourse = async () => {
  if (!selectedCourse.value?.id)
    return

  try {
    await $api(`/items/courses/${selectedCourse.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedCourse.value = null
    await fetchCourses()
  }
  catch (error) {
    console.error('Failed to delete course:', error)
  }
}

// Fetch courses on mount
onMounted(() => {
  fetchCourses()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Courses</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search courses..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Course
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="courses"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No courses found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="500"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Course' : 'Add New Course' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="form.courseCode"
                label="Course Code"
                placeholder="e.g., BSCS101"
                variant="outlined"
                :rules="[v => !!v || 'Course code is required']"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="form.courseName"
                label="Course Name"
                placeholder="e.g., Introduction to Computer Science"
                variant="outlined"
                :rules="[v => !!v || 'Course name is required']"
              />
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
            :disabled="!form.courseCode || !form.courseName"
            @click="saveCourse"
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
          Delete Course
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedCourse?.courseName }}</strong>?
          This action cannot be undone.
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
            @click="deleteCourse"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
