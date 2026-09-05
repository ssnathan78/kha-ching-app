import { Box, Button, Typography } from "@mui/material"
import Link from "next/link"
import { useRouter } from "next/router"

import StratLayout from "../../components/StratLayout"
import AtmStraddleSetup from "../../components/trades/atmStraddle"
import AtmStrangleSetup from "../../components/trades/atmStrangle"
import { EXIT_STRATEGIES, INSTRUMENTS } from "../../lib/constants"

const Strategy = () => {
  const router = useRouter()
  const { strategy } = router.query

  switch (strategy) {
    case "straddle": {
      return (
        <StratLayout>
          <Button component={Link} href="/help/straddle" size="small" sx={{ mb: 2 }}>
            Straddle guide
          </Button>
          <AtmStraddleSetup
            enabledInstruments={[INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY, INSTRUMENTS.FINNIFTY]}
            exitStrategies={[EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X, EXIT_STRATEGIES.NO_SL]}
          />
        </StratLayout>
      )
    }
    case "strangle": {
      return (
        <StratLayout>
          <Button component={Link} href="/help/strangle" size="small" sx={{ mb: 2 }}>
            Strangle guide
          </Button>
          <AtmStrangleSetup
            enabledInstruments={[INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY]}
            exitStrategies={[EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X, EXIT_STRATEGIES.NO_SL]}
          />
        </StratLayout>
      )
    }
    default: {
      return (
        <StratLayout>
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Unknown strategy
            </Typography>
            <Button component={Link} href="/dashboard">
              Back to dashboard
            </Button>
          </Box>
        </StratLayout>
      )
    }
  }
}

export default Strategy
export { getServerSideProps } from "../../lib/ssrPage"
