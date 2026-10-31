import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from 'react-email';

interface VerificationEmailProps {
  userName: string;
  verificationUrl: string;
  appName?: string;
}

export const VerificationEmail = ({
  verificationUrl,
  userName,
  appName = 'Commuforge',
}: VerificationEmailProps) => (
  <Html>
    <Head />
    <Tailwind>
      <Body className='font-koala bg-white'>
        <Preview>Verify your email for {appName}</Preview>
        <Container className='mx-auto py-5 pb-12'>
          <Text className='text-[16px] leading-6.5'>Hi {userName},</Text>
          <Text className='text-[16px] leading-6.5'>
            Welcome to Commuforge, Thank you for signing up for {appName}.
            Please confirm your email address by clicking the button below.
          </Text>
          <Section className='text-center'>
            <Button
              className='block rounded-[3px] bg-[#0069a8] p-3 text-center text-[16px] text-white no-underline'
              href={verificationUrl}
            >
              Verify your email
            </Button>
          </Section>
          <Text className='text-[12px] text-[#8898aa]'>
            If you did not create an account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default VerificationEmail;
