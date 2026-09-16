<?php

declare(strict_types=1);

use Greenter\XMLSecLibs\Sunat\SignedXml;
use Greenter\Ws\Services\SunatEndpoints;
use Librefact\GreenterAdapter\Mapping\EmitDocumentRequestMapper;
use Librefact\GreenterAdapter\Sunat\SunatInvoiceSender;
use Librefact\GreenterAdapter\Sunat\SunatSubmissionCredentials;
use Librefact\GreenterAdapter\Support\EnvFileLoader;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlGenerator;
use Librefact\GreenterAdapter\Xml\EmitDocumentXmlSigner;
use PHPUnit\Framework\TestCase;

final class SunatBetaRealSubmissionTest extends TestCase
{
    public function testRealSunatBetaSubmissionReturnsMeaningfulCdrOrError(): void
    {
        self::assertTrue(
            class_exists(EnvFileLoader::class),
            'The env loader must exist before the real SUNAT beta integration contract can pass.'
        );

        EnvFileLoader::load(dirname(__DIR__, 3) . '/.env');

        if (getenv('LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND') !== '1') {
            self::markTestSkipped('Real SUNAT beta send is disabled. Set LIBREFACT_ALLOW_REAL_SUNAT_BETA_SEND=1 to run it.');
        }

        $this->assertBetaEnvironment();
        self::assertTrue(extension_loaded('soap'), 'PHP extension ext-soap must be installed/enabled to call SUNAT beta via Greenter SoapClient.');

        $ruc = $this->requiredEnv('LIBREFACT_SUNAT_RUC');
        $serie = $this->requiredEnv('LIBREFACT_SUNAT_DOCUMENT_SERIE');
        $correlative = (int) $this->requiredEnv('LIBREFACT_SUNAT_DOCUMENT_CORRELATIVE');
        $pem = file_get_contents($this->requiredEnv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH'));
        self::assertIsString($pem);
        self::assertNotSame('', $pem);

        $payload = $this->payload($ruc, $serie, $correlative);
        $request = (new EmitDocumentRequestMapper())->fromPayload($payload);
        $unsignedXml = (new EmitDocumentXmlGenerator())->generate($request);
        $signedXml = (new EmitDocumentXmlSigner())->sign($unsignedXml, $pem);

        self::assertStringContainsString('<ds:Signature', $signedXml);
        self::assertTrue((new SignedXml())->verifyXml($signedXml));

        $filename = sprintf('%s-01-%s-%d', $ruc, $serie, $correlative);
        $result = (new SunatInvoiceSender())->sendSignedInvoice(
            $filename,
            $signedXml,
            new SunatSubmissionCredentials(
                $ruc,
                $this->requiredEnv('LIBREFACT_SUNAT_SOL_USER'),
                $this->requiredEnv('LIBREFACT_SUNAT_SOL_PASSWORD'),
                $this->requiredEnv('LIBREFACT_SUNAT_ENDPOINT') ?: SunatEndpoints::FE_BETA
            )
        );

        self::assertTrue(
            $result->success() || $result->errorCode() !== null || $result->errorMessage() !== null,
            'SUNAT beta response must be either accepted CDR or actionable SUNAT/transport error.'
        );

        if ($result->success()) {
            self::assertNotNull($result->cdrCode());
            self::assertNotNull($result->cdrDescription());
            return;
        }

        self::assertNotSame('', (string) ($result->errorCode() ?? $result->errorMessage()));
    }

    private function assertBetaEnvironment(): void
    {
        self::assertSame('beta', $this->requiredEnv('LIBREFACT_SUNAT_ENV'));
        self::assertStringContainsString('e-beta.sunat.gob.pe', $this->requiredEnv('LIBREFACT_SUNAT_ENDPOINT'));
        self::assertFileExists($this->requiredEnv('LIBREFACT_SUNAT_CERTIFICATE_PEM_PATH'));
    }

    private function requiredEnv(string $name): string
    {
        $value = getenv($name);
        self::assertIsString($value, sprintf('%s must be set.', $name));
        self::assertNotSame('', $value, sprintf('%s must not be empty.', $name));

        return $value;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(string $ruc, string $serie, int $correlative): array
    {
        return [
            'tax_authority' => [
                'country' => 'PE',
                'code' => 'SUNAT',
                'provider' => 'greenter',
            ],
            'document' => [
                'type' => 'invoice',
                'serie' => $serie,
                'number' => $correlative,
                'currency' => 'PEN',
                'issue_date' => date('Y-m-d'),
            ],
            'issuer' => [
                'ruc' => $ruc,
                'legal_name' => getenv('LIBREFACT_SUNAT_ISSUER_LEGAL_NAME') ?: 'LIBREFACT BETA TEST',
                'address' => [
                    'ubigueo' => getenv('LIBREFACT_SUNAT_ISSUER_UBIGEO') ?: null,
                    'codigo_pais' => 'PE',
                    'departamento' => getenv('LIBREFACT_SUNAT_ISSUER_DEPARTAMENTO') ?: null,
                    'provincia' => getenv('LIBREFACT_SUNAT_ISSUER_PROVINCIA') ?: null,
                    'distrito' => getenv('LIBREFACT_SUNAT_ISSUER_DISTRITO') ?: null,
                    'direccion' => getenv('LIBREFACT_SUNAT_ISSUER_DIRECCION') ?: null,
                    'cod_local' => getenv('LIBREFACT_SUNAT_ISSUER_COD_LOCAL') ?: '0000',
                ],
            ],
            'customer' => [
                'document_type' => getenv('LIBREFACT_SUNAT_CUSTOMER_DOCUMENT_TYPE') ?: '6',
                'document_number' => getenv('LIBREFACT_SUNAT_CUSTOMER_DOCUMENT_NUMBER') ?: '20000000001',
                'legal_name' => getenv('LIBREFACT_SUNAT_CUSTOMER_LEGAL_NAME') ?: 'CLIENTE BETA SUNAT',
            ],
            'items' => [[
                'description' => 'Servicio beta Librefact',
                'quantity' => 1,
                'unit_value' => 100,
                'igv' => 18,
                'total' => 118,
            ]],
            'totals' => [
                'taxable' => 100,
                'igv' => 18,
                'total' => 118,
            ],
        ];
    }
}
