import { Button, Card, CardActionArea, CardContent, Grid, Typography } from "@mui/material"
import Link from "next/link"

import Layout from "../../components/Layout"
import { HELP_PAGES, HELP_TOPICS } from "../../lib/helpContent"

const HelpIndex = () => {
  return (
    <Layout title="Guide" maxWidth="md">
      <Typography variant="h5" component="h1">
        User guide
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        What each area of the desk is for, and what the strategy fields actually change.
      </Typography>
      <Grid container spacing={2}>
        {HELP_TOPICS.map(topic => {
          const page = HELP_PAGES[topic]
          return (
            <Grid size={{ xs: 12, sm: 6 }} key={topic}>
              <Card>
                <CardActionArea component={Link} href={`/help/${topic}`}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {page.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {page.summary}
                    </Typography>
                    <Button size="small" sx={{ mt: 2 }}>
                      Open
                    </Button>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          )
        })}
      </Grid>
    </Layout>
  )
}

export default HelpIndex
export { getServerSideProps } from "../../lib/ssrPage"
