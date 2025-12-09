import type { VerticalNavItems } from '@layouts/types'

export default [
  {
    title: 'Dashboard',
    to: { name: 'dashboard' },
    icon: { icon: 'ri-home-smile-line' },
  },

  { heading: 'Academic Management' },
  {
    title: 'Programs',
    to: { name: 'programs' },
    icon: { icon: 'ri-book-2-line' },
  },
  {
    title: 'Courses',
    to: { name: 'courses' },
    icon: { icon: 'ri-booklet-line' },
  },
  {
    title: 'Class Sections',
    to: { name: 'class-sections' },
    icon: { icon: 'ri-layout-grid-line' },
  },
  {
    title: 'Academic Terms',
    to: { name: 'academic-terms' },
    icon: { icon: 'ri-calendar-line' },
  },

  { heading: 'Class & Department' },
  {
    title: 'Departments',
    to: { name: 'departments' },
    icon: { icon: 'ri-building-line' },
  },
  {
    title: 'Class List',
    to: { name: 'classes' },
    icon: { icon: 'ri-group-line' },
  },

  { heading: 'Users' },
  {
    title: 'Students',
    to: { name: 'students' },
    icon: { icon: 'ri-user-3-line' },
  },
  {
    title: 'Teachers',
    to: { name: 'teachers' },
    icon: { icon: 'ri-user-star-line' },
  },

  { heading: 'Surveys' },
  {
    title: 'Survey Management',
    to: { name: 'surveys' },
    icon: { icon: 'ri-survey-line' },
  },
] as VerticalNavItems
