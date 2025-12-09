import type { VerticalNavItems } from '@layouts/types'

export default [
  {
    title: 'Dashboard',
    to: { name: 'dean-dashboard' },
    icon: { icon: 'ri-dashboard-line' },
  },
  {
    title: 'Surveys',
    to: { name: 'dean-surveys' },
    icon: { icon: 'ri-survey-line' },
  },
  {
    title: 'Evaluations',
    to: { name: 'dean-evaluations' },
    icon: { icon: 'ri-bar-chart-box-line' },
  },
  {
    title: 'Teachers',
    to: { name: 'dean-teachers' },
    icon: { icon: 'ri-user-star-line' },
  },
  {
    title: 'Students',
    to: { name: 'dean-students' },
    icon: { icon: 'ri-user-3-line' },
  },
  {
    title: 'Classes',
    to: { name: 'dean-classes' },
    icon: { icon: 'ri-group-line' },
  },
] as VerticalNavItems
