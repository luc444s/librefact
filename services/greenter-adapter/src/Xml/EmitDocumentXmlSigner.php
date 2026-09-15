<?php

declare(strict_types=1);

namespace Librefact\GreenterAdapter\Xml;

use Greenter\XMLSecLibs\Sunat\SignedXml;

final class EmitDocumentXmlSigner
{
    public function sign(string $unsignedXml, string $certificatePem): string
    {
        $signedXml = new SignedXml();
        $signedXml->setCertificate($certificatePem);

        return $signedXml->signXml($unsignedXml);
    }
}
