<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Sunat;

use Greenter\Model\Response\BillResult;
use Greenter\Services\SenderInterface;
use Greenter\Ws\Services\BillSender;
use Greenter\Ws\Services\SoapClient;

final class SunatInvoiceSender
{
    /** @var SenderInterface|null */
    private $sender;

    public function __construct(?SenderInterface $sender = null)
    {
        $this->sender = $sender;
    }

    public function sendSignedInvoice(
        string $filename,
        string $signedXml,
        SunatSubmissionCredentials $credentials
    ): SunatInvoiceSubmissionResult {
        $result = $this->sender($credentials)->send($filename, $signedXml);

        if (!$result instanceof BillResult) {
            throw new \RuntimeException('SUNAT bill sender did not return a bill result.');
        }

        return SunatInvoiceSubmissionResult::fromBillResult($result);
    }

    private function sender(SunatSubmissionCredentials $credentials): SenderInterface
    {
        if ($this->sender !== null) {
            return $this->sender;
        }

        $client = new SoapClient();
        $client->setCredentials($credentials->soapUser(), $credentials->solPassword());
        $client->setService($credentials->endpoint());

        return (new BillSender())->setClient($client);
    }
}
