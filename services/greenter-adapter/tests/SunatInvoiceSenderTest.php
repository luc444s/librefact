<?php

declare(strict_types=1);

use Greenter\Model\Response\BaseResult;
use Greenter\Model\Response\BillResult;
use Greenter\Model\Response\CdrResponse;
use Greenter\Services\SenderInterface;
use Greenter\Ws\Services\SunatEndpoints;
use Librefact\GreenterAdapter\Sunat\SunatInvoiceSender;
use Librefact\GreenterAdapter\Sunat\SunatSubmissionCredentials;
use PHPUnit\Framework\TestCase;

final class SunatInvoiceSenderTest extends TestCase
{
    public function testSignedInvoiceCanBeSubmittedToSunatSenderAndCdrIsMapped(): void
    {
        self::assertTrue(
            class_exists(SunatInvoiceSender::class),
            'The SUNAT invoice sender class must exist before this contract can pass.'
        );

        $fakeSender = new FakeSunatBillSender();
        $credentials = new SunatSubmissionCredentials('20000000001', 'MODDATOS', 'moddatos');
        $result = (new SunatInvoiceSender($fakeSender))->sendSignedInvoice(
            '20000000001-01-F001-1',
            '<Invoice><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></Invoice>',
            $credentials
        );

        self::assertSame('20000000001-01-F001-1', $fakeSender->filename);
        self::assertStringContainsString('<Invoice>', $fakeSender->content);
        self::assertSame('20000000001MODDATOS', $credentials->soapUser());
        self::assertSame(SunatEndpoints::FE_BETA, $credentials->endpoint());

        self::assertTrue($result->success());
        self::assertSame('0', $result->cdrCode());
        self::assertSame('La Factura numero F001-1, ha sido aceptada', $result->cdrDescription());
        self::assertSame(['SUNAT beta accepted the document'], $result->cdrNotes());
        self::assertSame('fake-cdr-zip', $result->cdrZip());
        self::assertNull($result->errorCode());
        self::assertNull($result->errorMessage());
    }
}

final class FakeSunatBillSender implements SenderInterface
{
    /** @var string|null */
    public $filename;

    /** @var string|null */
    public $content;

    public function send(?string $filename, ?string $content): ?BaseResult
    {
        $this->filename = $filename;
        $this->content = $content;

        $cdr = (new CdrResponse())
            ->setCode('0')
            ->setDescription('La Factura numero F001-1, ha sido aceptada')
            ->setNotes(['SUNAT beta accepted the document']);

        return (new BillResult())
            ->setSuccess(true)
            ->setCdrResponse($cdr)
            ->setCdrZip('fake-cdr-zip');
    }
}
