import { Box, Button, Paper, Stack, Typography } from "@mui/material"
import Link from "next/link"
import { useRouter } from "next/router"

import Layout from "../../components/Layout"
import { HELP_PAGES, HELP_TOPICS, type HelpTopic } from "../../lib/helpContent"

const HelpTopicPage = () => {
  const router = useRouter()
  const topic = router.query.topic as HelpTopic
  const page = HELP_PAGES[topic]

  if (!router.isReady) {
    return <Layout title="Guide" loading />
  }

  if (!page) {
    return (
      <Layout title="Guide">
        <Typography variant="h6">Unknown guide</Typography>
        <Button component={Link} href="/help">
          All guides
        </Button>
      </Layout>
    )
  }

  return (
    <Layout title={page.title} maxWidth="md">
      <Button component={Link} href="/help" size="small" sx={{ mb: 2 }}>
        All guides
      </Button>
      <Typography variant="h5" component="h1">
        {page.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {page.summary}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap" }}>
        {HELP_TOPICS.map(key => (
          <Button
            key={key}
            size="small"
            variant={key === topic ? "contained" : "outlined"}
            component={Link}
            href={`/help/${key}`}
          >
            {HELP_PAGES[key].title}
          </Button>
        ))}
      </Stack>
      <Stack spacing={2}>
        {page.sections.map(section => (
          <Paper id={section.id} key={section.id} sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {section.title}
            </Typography>
            {section.body.map(paragraph => (
              <Typography key={paragraph.slice(0, 40)} color="text.secondary" sx={{ mb: 1 }}>
                {paragraph}
              </Typography>
            ))}
          </Paper>
        ))}
      </Stack>
      <Box sx={{ height: 48 }} />
    </Layout>
  )
}

export default HelpTopicPage
export { getServerSideProps } from "../../lib/ssrPage"
